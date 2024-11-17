import { DateTime } from "luxon";
import { MojangClient } from "../../apis/Mojang";
import { TimeUtil } from "../../utils/TimeUtil";

import { userMention } from "discord.js";
import {
    DiscordIdProp,
    Document,
    Prop,
    SchemaDocument,
    UuidProp,
    getSchemaFromClass,
    modelSchemaWithCache,
} from "../util";

@Document("UserProfile", "userprofiles")
class UserProfileSchema {
    static getUsername(id: string) {
        return UserProfile.cache.get(id)?.username;
    }

    static resolve(resolvable: string) {
        return UserProfile.cache.get(resolvable) ?? nameCache.get(resolvable.toLowerCase());
    }

    static getNames() {
        return Array.from(nameCache.keys());
    }

    @DiscordIdProp({ required: true })
    _id!: string;

    @Prop({ type: String, required: true })
    username!: string;

    @Prop({ type: Date, required: true })
    joinedAt!: Date;

    @UuidProp({ required: false })
    mcUUID?: string;

    @Prop({ type: Number, required: false })
    offset?: number;

    @Prop({ type: Number, default: 0 }) // Wins property with default 0
    wins!: number;

    @Prop({ type: Number, default: 0 }) // Losses property with default 0
    losses!: number;

    getCurrentTime() {
        if (!this.offset) return undefined;
        return DateTime.now().plus({ minutes: this.offset });
    }

    getUTCOffset() {
        if (!this.offset) return undefined;
        return TimeUtil.stringifyOffset(this.offset);
    }

    async fetchMCUsername() {
        if (!this.mcUUID) return undefined;
        return MojangClient.uuidToName(this.mcUUID);
    }

    toString() {
        return userMention(this._id);
    }

    // Method to update wins or losses
    static async updateStats(id, type, action) {
        const userProfile = await UserProfile.findById(id);
        if (!userProfile) {
            throw new Error(`User profile with ID ${id} not found.`);
        }

        // Increment or decrement wins/losses based on type and action
        const incrementValue = action === "dodaj" ? 1 : -1;
        if (type === "wygrana") {
            userProfile.wins += incrementValue;
        } else if (type === "przegrana") {
            userProfile.losses += incrementValue;
        }

        await userProfile.save();
        return userProfile;
    }
}

// Schema and model setup
const schema = getSchemaFromClass(UserProfileSchema);
export const UserProfile = modelSchemaWithCache(schema, UserProfileSchema);
export type UserProfile = SchemaDocument<typeof schema>;

// Cache management
const nameCache = new Map<string, UserProfile>();
UserProfile.cache
    .on("add", (profile) => nameCache.set(profile.username.toLowerCase(), profile))
    .on("delete", (profile) => nameCache.delete(profile.username.toLowerCase()));
