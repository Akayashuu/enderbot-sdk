import { SdkVersion } from "../Version.js"
import { type CacheStore, MemoryCache, NoCache } from "./HttpCache.js"
import { HttpDecodeError, HttpRequestError, HttpStatusError } from "./HttpErrors.js"

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface RequestOptions {
    signal?: AbortSignal
}

export interface Sleeper {
    wait(ms: number): Promise<void>
}

export class TimerSleeper implements Sleeper {
    wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }
}

export interface HttpClientOptions {
    baseUrl: string
    timeoutMs?: number
    retries?: number
    retryBackoffMs?: number
    headers?: Record<string, string>
    userAgent?: string
    fetch?: FetchLike
    cache?: CacheStore | false
    defaultTtlMs?: number
    respectCacheControl?: boolean
    sleeper?: Sleeper
}

export class RetryPolicy {
    private static readonly RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

    static allowsStatus(status: number): boolean {
        return RetryPolicy.RETRYABLE_STATUS.has(status)
    }

    static backoffMs(base: number, attempt: number): number {
        return base * 2 ** attempt
    }
}

export class CacheControl {
    private static readonly MAX_AGE = /max-age=(\d+)/i

    static ttlMs(response: Response, fallbackMs: number): number {
        const header = response.headers.get("cache-control")
        if (!header) return fallbackMs
        if (/no-store|no-cache/i.test(header)) return 0
        const match = CacheControl.MAX_AGE.exec(header)
        if (!match?.[1]) return fallbackMs
        return Number(match[1]) * 1000
    }
}

export class HttpUrl {
    static join(baseUrl: string, path: string): string {
        const base = baseUrl.replace(/\/+$/, "")
        const tail = path.replace(/^\/+/, "")
        return tail.length > 0 ? `${base}/${tail}` : base
    }
}

export class JsonHttpClient {
    private static readonly DEFAULT_USER_AGENT = SdkVersion.userAgent

    private readonly baseUrl: string
    private readonly timeoutMs: number
    private readonly retries: number
    private readonly retryBackoffMs: number
    private readonly headers: Record<string, string>
    private readonly fetch: FetchLike
    private readonly cache: CacheStore
    private readonly defaultTtlMs: number
    private readonly respectCacheControl: boolean
    private readonly sleeper: Sleeper

    constructor(options: HttpClientOptions) {
        this.baseUrl = options.baseUrl
        this.timeoutMs = options.timeoutMs ?? 10_000
        this.retries = Math.max(0, options.retries ?? 2)
        this.retryBackoffMs = options.retryBackoffMs ?? 250
        this.fetch = options.fetch ?? JsonHttpClient.globalFetch()
        this.cache = JsonHttpClient.cacheOf(options.cache)
        this.defaultTtlMs = options.defaultTtlMs ?? 300_000
        this.respectCacheControl = options.respectCacheControl ?? true
        this.sleeper = options.sleeper ?? new TimerSleeper()
        this.headers = {
            accept: "application/json",
            "user-agent": options.userAgent ?? JsonHttpClient.DEFAULT_USER_AGENT,
            ...options.headers,
        }
    }

    async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
        const url = HttpUrl.join(this.baseUrl, path)
        const cached = this.cache.get<T>(url)
        if (cached !== undefined) return cached

        const response = await this.send(url, options.signal)
        const body = await this.decode(url, response)
        if (!response.ok) throw new HttpStatusError(url, response.status, body)

        this.cache.set(url, body, this.ttlOf(response))
        return body as T
    }

    invalidate(path: string): void {
        this.cache.delete(HttpUrl.join(this.baseUrl, path))
    }

    clearCache(): void {
        this.cache.clear()
    }

    get origin(): string {
        return this.baseUrl
    }

    private async send(url: string, signal: AbortSignal | undefined): Promise<Response> {
        let lastFailure: unknown
        for (let attempt = 0; attempt <= this.retries; attempt += 1) {
            if (attempt > 0) {
                await this.sleeper.wait(RetryPolicy.backoffMs(this.retryBackoffMs, attempt - 1))
            }
            try {
                const response = await this.fetch(url, {
                    headers: this.headers,
                    redirect: "follow",
                    signal: JsonHttpClient.signalOf(this.timeoutMs, signal),
                })
                if (response.ok || !RetryPolicy.allowsStatus(response.status)) return response
                lastFailure = new HttpStatusError(url, response.status, null)
                if (attempt === this.retries) return response
            } catch (cause) {
                lastFailure = cause
            }
        }
        throw new HttpRequestError(url, this.retries + 1, lastFailure)
    }

    private async decode(url: string, response: Response): Promise<unknown> {
        const text = await response.text().catch(() => "")
        if (text.length === 0) return null
        try {
            return JSON.parse(text)
        } catch (cause) {
            if (!response.ok) return text
            throw new HttpDecodeError(url, cause)
        }
    }

    private ttlOf(response: Response): number {
        if (!this.respectCacheControl) return this.defaultTtlMs
        return CacheControl.ttlMs(response, this.defaultTtlMs)
    }

    private static signalOf(timeoutMs: number, signal: AbortSignal | undefined): AbortSignal {
        const timeout = AbortSignal.timeout(timeoutMs)
        return signal ? AbortSignal.any([timeout, signal]) : timeout
    }

    private static cacheOf(cache: CacheStore | false | undefined): CacheStore {
        if (cache === false) return new NoCache()
        return cache ?? new MemoryCache()
    }

    private static globalFetch(): FetchLike {
        if (typeof globalThis.fetch !== "function") {
            throw new TypeError("global fetch is unavailable, pass options.fetch explicitly")
        }
        return globalThis.fetch.bind(globalThis) as FetchLike
    }
}
