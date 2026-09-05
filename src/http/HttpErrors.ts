export class EnderbotSdkError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options)
        this.name = new.target.name
    }
}

export class HttpRequestError extends EnderbotSdkError {
    readonly url: string
    readonly attempts: number

    constructor(url: string, attempts: number, cause: unknown) {
        super(
            `GET ${url} failed after ${attempts} attempt(s): ${HttpRequestError.reasonOf(cause)}`,
            {
                cause,
            },
        )
        this.url = url
        this.attempts = attempts
    }

    private static reasonOf(cause: unknown): string {
        if (cause instanceof Error) return cause.message
        return String(cause)
    }
}

export class HttpStatusError extends EnderbotSdkError {
    readonly url: string
    readonly status: number
    readonly body: unknown

    constructor(url: string, status: number, body: unknown) {
        super(`GET ${url} answered ${status}`)
        this.url = url
        this.status = status
        this.body = body
    }
}

export class HttpDecodeError extends EnderbotSdkError {
    readonly url: string

    constructor(url: string, cause: unknown) {
        super(`GET ${url} answered a body that is not JSON`, { cause })
        this.url = url
    }
}
