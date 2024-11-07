import mongoose, {
    CompileModelOptions,
    FilterQuery,
    HydratedDocument,
    InferSchemaType,
    Model,
    ObtainSchemaGeneric,
    Query,
    Schema,
    SchemaDefinitionProperty,
} from "mongoose"
import MongooseAutopopulate from "mongoose-autopopulate"
import { randomUUID } from "node:crypto"
import "reflect-metadata"

import { DocumentCache } from "./DocumentCache"
import { DocumentWatcher } from "./DocumentWatcher"

type NonFunctionPropertyNames<T> = {
    [K in keyof T]: T[K] extends Function ? never : K
}[keyof T]
type NonFunctionProperties<T> = Pick<T, NonFunctionPropertyNames<T>>
type Class<T> = new (...args: any[]) => T

export type SchemaDocument<TSchema extends Schema = any> = HydratedDocument<
    InferSchemaType<TSchema>,
    ObtainSchemaGeneric<TSchema, "TInstanceMethods">,
    ObtainSchemaGeneric<TSchema, "TQueryHelpers">
>

export type SchemaModel<TSchema extends Schema, TStatic extends object = object> = Omit<
    Model<
        InferSchemaType<TSchema>,
        ObtainSchemaGeneric<TSchema, "TQueryHelpers">,
        ObtainSchemaGeneric<TSchema, "TInstanceMethods">,
        object,
        SchemaDocument<TSchema>
    >,
    "new" | "watch" | "create"
> &
    ObtainSchemaGeneric<TSchema, "TStaticMethods"> &
    TStatic &
    (new (doc: Partial<NonFunctionProperties<InferSchemaType<TSchema>>>) => SchemaDocument<TSchema>) & {
        _watcher?: DocumentWatcher<SchemaDocument<TSchema>>
        watcher: () => DocumentWatcher<SchemaDocument<TSchema>>
        watch: never
        findAndMap: (
            filter?: FilterQuery<InferSchemaType<TSchema>>,
            ...keys: string[]
        ) => Promise<Record<string, SchemaDocument<TSchema>>>
        create: (
            doc: Partial<NonFunctionProperties<InferSchemaType<TSchema>>>,
        ) => Promise<SchemaDocument<TSchema>>
    }

export type CachedModel<TSchema extends Schema, TStatic extends object = object> = SchemaModel<
    TSchema,
    TStatic
> & {
    cache: DocumentCache<SchemaDocument<TSchema>>
    reloadCache: () => Promise<void>
}

export function model<TSchema extends Schema>(
    name: string,
    schema: TSchema,
    collection?: string,
    options?: CompileModelOptions,
): SchemaModel<TSchema> {
    schema.plugin(MongooseAutopopulate)
    if (schema.get("versionKey") === "__v") schema.set("versionKey", false)

    const model = mongoose.model(name, schema, collection, options) as SchemaModel<TSchema>

    Object.defineProperty(model, "watcher", {
        value: () => {
            if (!model._watcher) model._watcher = new DocumentWatcher(model as Model<any>)
            return model._watcher
        },
    })

    model.findAndMap = async (filter = {}, ...keys) => {
        if (!keys.length) keys.push("id")
        const docs = await model.find(filter)
        return Object.fromEntries(docs.map((doc) => [keys.reduce((v, key) => (v as any)?.[key], doc), doc]))
    }

    return model
}

export function getSchemaFromClass<EnforcedDocType>(schemaClass: Class<EnforcedDocType>) {
    const metadata = Reflect.getMetadata("mongodb:schema", schemaClass)
    return new mongoose.Schema<EnforcedDocType>(metadata.properties, {
        methods: metadata.methods,
        statics: metadata.statics,
    })
}

export function modelSchema<TSchema extends Schema, SchemaClass extends object>(
    schema: TSchema,
    schemaClass: SchemaClass,
) {
    const metadata = Reflect.getMetadata("mongodb:schema", schemaClass)
    return model(metadata.name, schema, metadata.collection) as SchemaModel<typeof schema, SchemaClass>
}

/**
 * Override Mongoose Query then & catch to get useful stacktraces.
 */

const queryThen = Query.prototype.then
// @ts-expect-error
Query.prototype.then = function (onFulfilled, onRejected) {
    const stackTrace = new Error().stack?.split("\n") ?? []
    const filteredTrace = stackTrace.slice(2).filter((v) => !v.includes("node:"))

    return queryThen.apply(this, [
        onFulfilled ? (value) => onFulfilled(value) : undefined,
        rejectHandler(filteredTrace, onRejected),
    ])
}

const queryCatch = Query.prototype.catch
Query.prototype.catch = function (onRejected) {
    const stackTrace = new Error().stack?.split("\n") ?? []
    const filteredTrace = stackTrace.slice(2).filter((v) => !v.includes("node:"))
    return queryCatch.apply(this, [rejectHandler(filteredTrace, onRejected)])
}

function rejectHandler(
    filteredTrace: string[],
    onRejected: ((reason: unknown) => unknown) | null | undefined,
) {
    return (err: unknown) => {
        if (err instanceof Error) {
            const start = err.stack?.split("\n")[0] ?? "MongooseError: Query failed"
            err.stack = [start, ...filteredTrace].join("\n")
            throw err
        } else if (onRejected) {
            onRejected(err)
        }
    }
}

const reloadCacheFunctions = new Array<() => Promise<unknown>>()
export async function reloadCache() {
    await Promise.all(reloadCacheFunctions.map((v) => v()))
}

export function modelSchemaWithCache<TSchema extends Schema, SchemaClass extends object>(
    schema: TSchema,
    schemaClass: SchemaClass,
): CachedModel<TSchema, SchemaClass> {
    const cache = new DocumentCache()

    if (process.env.NODE_ENV !== "production") {
        // fallback to fetching all data every operation to keep the cache synced
        // if not being run on a Mongo replica set
        schema.post(
            // @ts-expect-error works just fine
            [
                "save",
                "updateOne",
                "updateMany",
                "deleteOne",
                "deleteMany",
                "replaceOne",
                "findOneAndDelete",
                "findOneAndRemove",
                "findOneAndReplace",
                "findOneAndUpdate",
            ],
            { document: true, query: true },
            () => reloadCache().catch(console.error),
        )
    }

    async function reloadCache() {
        return cachedModel.find().then((docs) => {
            const newKeys = docs.map((v) => v.id) as string[]
            Array.from(cache.keys())
                .filter((key) => !newKeys.includes(key))
                .forEach((key) => cache.delete(key))

            docs.forEach((doc) => {
                const existing = cache.get(doc.id!)
                if (!existing || JSON.stringify(existing) !== JSON.stringify(doc)) cache.set(doc.id!, doc)
            })

            cache._triggerReloaded()
        })
    }

    const cachedModel = modelSchema(schema, schemaClass)
    Object.defineProperty(cachedModel, "cache", { value: cache })
    Object.defineProperty(cachedModel, "reloadCache", { value: reloadCache })
    reloadCacheFunctions.push(reloadCache)

    if (process.env.NODE_ENV === "production") {
        // production environment uses a Mongo replica set
        cachedModel
            .watcher()
            .on("delete", (id) => {
                cache.delete((id as any).toString())
                cache._triggerReloaded()
            })
            .on("insert", (doc) => {
                cache.set(doc.id!, doc)
                cache._triggerReloaded()
            })
            .on("update", (_, __, fullDoc) => {
                if (fullDoc) {
                    cache.set(fullDoc.id!, fullDoc)
                    cache._triggerReloaded()
                }
            })
    }

    cachedModel.db.on("open", () => reloadCache().catch(console.error))
    return cachedModel as CachedModel<TSchema, SchemaClass>
}

export function Document(name: string, collection: string): ClassDecorator {
    return (target) => {
        const metadata = Reflect.getMetadata("mongodb:schema", target) || {}
        metadata.name = name
        metadata.collection = collection
        if (!metadata.methods) metadata.methods = {}
        if (!metadata.statics) metadata.statics = {}

        const descriptors = Object.getOwnPropertyDescriptors(target.prototype)
        for (const [propName, descriptor] of Object.entries(descriptors)) {
            if (typeof descriptor.value === "function" && propName !== "constructor") {
                metadata.methods[propName] = descriptor.value
            }
        }

        const staticDescriptors = Object.getOwnPropertyDescriptors(target)
        for (const [propName, descriptor] of Object.entries(staticDescriptors)) {
            if (typeof descriptor.value === "function") {
                metadata.statics[propName] = descriptor.value
            }
        }

        Reflect.defineMetadata("mongodb:schema", metadata, target)
    }
}

export function Prop(schemaDefinition: SchemaDefinitionProperty): PropertyDecorator {
    return (target, prop) => {
        if (typeof prop === "string") {
            const metadata = Reflect.getMetadata("mongodb:schema", target.constructor) || {}
            if (!metadata.properties) metadata.properties = {}
            metadata.properties[prop] = schemaDefinition
            Reflect.defineMetadata("mongodb:schema", metadata, target.constructor)
        }
    }
}

export function UuidProp({ required }: { required: boolean }) {
    return Prop({
        type: mongoose.Schema.Types.UUID,
        required,
        default: required ? () => randomUUID() : undefined,
    })
}

/** Use to save Discord IDs as Longs but read them as strings */
export function DiscordIdProp({ required }: { required: boolean }) {
    return Prop({
        type: mongoose.Schema.Types.Long,
        required,
        get: (value: mongoose.Types.Long | undefined) => value && value.toString(),
    })
}

export function DiscordIdArrayProp({ required }: { required: boolean }) {
    return Prop({
        type: [mongoose.Schema.Types.Long],
        required,
        get: (value: mongoose.Types.Long[] | undefined) => value && value.map((v) => v.toString()),
    })
}
