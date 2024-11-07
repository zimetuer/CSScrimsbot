declare global {
    interface Date {
        toSeconds(): number
    }

    function sleep(ms: number): Promise<void>

    interface Console {
        /** Log a message if not in production */
        debug(message?: unknown, ...params: unknown[]): void

        /** Log an error if not in production */
        debugError(message?: unknown, ...params: unknown[]): void
    }
}

Date.prototype.toSeconds = function () {
    return Math.floor(this.valueOf() / 1000)
}

global.sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

console.debug = function (...args: unknown[]) {
    if (process.env.NODE_ENV !== "production") console.log(...args)
}

console.debugError = function (...args: unknown[]) {
    if (process.env.NODE_ENV !== "production") console.error(...args)
}
