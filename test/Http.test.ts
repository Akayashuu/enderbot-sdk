import { describe, expect, it } from "vitest"
import { MemoryCache, NoCache } from "../src/http/HttpCache.js"
import { CacheControl, HttpUrl, JsonHttpClient, RetryPolicy } from "../src/http/HttpClient.js"
import { HttpDecodeError, HttpRequestError, HttpStatusError } from "../src/http/HttpErrors.js"
import { FakeFetch, FixedClock, InstantSleeper } from "./support/TestDoubles.js"

const ORIGIN = "https://wiki.test"
const URL_ONE = `${ORIGIN}/one`

const clientOf = (fetch: FakeFetch, overrides: Record<string, unknown> = {}) =>
    new JsonHttpClient({
        baseUrl: ORIGIN,
        fetch: fetch.handler,
        sleeper: new InstantSleeper(),
        ...overrides,
    })

describe("HttpUrl", () => {
    it("joins without doubling slashes", () => {
        expect(HttpUrl.join("https://a.test/", "/b/c")).toBe("https://a.test/b/c")
    })

    it("keeps the base alone for an empty path", () => {
        expect(HttpUrl.join("https://a.test/", "")).toBe("https://a.test")
    })
})

describe("RetryPolicy", () => {
    it("retries transient statuses only", () => {
        expect(RetryPolicy.allowsStatus(503)).toBe(true)
        expect(RetryPolicy.allowsStatus(429)).toBe(true)
        expect(RetryPolicy.allowsStatus(404)).toBe(false)
    })

    it("doubles the backoff per attempt", () => {
        expect(RetryPolicy.backoffMs(250, 0)).toBe(250)
        expect(RetryPolicy.backoffMs(250, 2)).toBe(1000)
    })
})

describe("CacheControl", () => {
    const responseOf = (header: string | null) =>
        new Response("{}", { headers: header ? { "cache-control": header } : {} })

    it("reads max-age", () => {
        expect(CacheControl.ttlMs(responseOf("public, max-age=300"), 1)).toBe(300_000)
    })

    it("refuses to cache no-store", () => {
        expect(CacheControl.ttlMs(responseOf("no-store"), 1000)).toBe(0)
    })

    it("falls back when the header is absent", () => {
        expect(CacheControl.ttlMs(responseOf(null), 1234)).toBe(1234)
    })
})

describe("MemoryCache", () => {
    it("expires entries against the injected clock", () => {
        const clock = new FixedClock()
        const cache = new MemoryCache(8, clock)
        cache.set("a", 1, 100)
        expect(cache.get("a")).toBe(1)
        clock.advance(101)
        expect(cache.get("a")).toBeUndefined()
    })

    it("ignores a non-positive ttl", () => {
        const cache = new MemoryCache(8, new FixedClock())
        cache.set("a", 1, 0)
        expect(cache.get("a")).toBeUndefined()
    })

    it("evicts the least recently read entry", () => {
        const cache = new MemoryCache(2, new FixedClock())
        cache.set("a", 1, 1000)
        cache.set("b", 2, 1000)
        cache.get("a")
        cache.set("c", 3, 1000)
        expect(cache.size).toBe(2)
        expect(cache.get("b")).toBeUndefined()
        expect(cache.get("a")).toBe(1)
    })
})

describe("JsonHttpClient", () => {
    it("serves a second read from the cache", async () => {
        const fetch = FakeFetch.of({
            [URL_ONE]: { body: { ok: true }, headers: { "cache-control": "max-age=60" } },
        })
        const client = clientOf(fetch)
        await client.get("one")
        await client.get("one")
        expect(fetch.countOf(URL_ONE)).toBe(1)
    })

    it("does not cache when the store is disabled", async () => {
        const fetch = FakeFetch.of({ [URL_ONE]: { body: { ok: true } } })
        const client = clientOf(fetch, { cache: false })
        await client.get("one")
        await client.get("one")
        expect(fetch.countOf(URL_ONE)).toBe(2)
    })

    it("refetches after invalidate", async () => {
        const fetch = FakeFetch.of({ [URL_ONE]: { body: { ok: true } } })
        const client = clientOf(fetch)
        await client.get("one")
        client.invalidate("one")
        await client.get("one")
        expect(fetch.countOf(URL_ONE)).toBe(2)
    })

    it("throws a status error carrying the parsed body", async () => {
        const fetch = FakeFetch.of({
            [URL_ONE]: { status: 404, body: { error: "not_found", path: "one" } },
        })
        const error = await clientOf(fetch)
            .get("one")
            .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(HttpStatusError)
        expect((error as HttpStatusError).status).toBe(404)
        expect((error as HttpStatusError).body).toEqual({ error: "not_found", path: "one" })
    })

    it("retries a transient status then succeeds", async () => {
        const fetch = new FakeFetch().on(URL_ONE, { status: 503, body: {} }, { body: { ok: true } })
        const body = await clientOf(fetch).get<{ ok: boolean }>("one")
        expect(body.ok).toBe(true)
        expect(fetch.countOf(URL_ONE)).toBe(2)
    })

    it("gives up after the retry budget", async () => {
        const fetch = new FakeFetch().failTimes(URL_ONE, 5).on(URL_ONE, { body: {} })
        const error = await clientOf(fetch, { retries: 1 })
            .get("one")
            .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(HttpRequestError)
        expect((error as HttpRequestError).attempts).toBe(2)
        expect(fetch.countOf(URL_ONE)).toBe(2)
    })

    it("waits between attempts", async () => {
        const sleeper = new InstantSleeper()
        const fetch = new FakeFetch().failTimes(URL_ONE, 1).on(URL_ONE, { body: { ok: true } })
        await clientOf(fetch, { sleeper, retryBackoffMs: 10 }).get("one")
        expect(sleeper.waits).toEqual([10])
    })

    it("rejects a body that is not JSON", async () => {
        const fetch = FakeFetch.of({ [URL_ONE]: { text: "<html>nope</html>" } })
        const error = await clientOf(fetch)
            .get("one")
            .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(HttpDecodeError)
    })

    it("composes the caller signal with its own timeout", async () => {
        const fetch = FakeFetch.of({ [URL_ONE]: { body: { ok: true } } })
        const controller = new AbortController()
        await clientOf(fetch).get("one", { signal: controller.signal })
        const signal = fetch.inits[0]?.signal
        expect(signal?.aborted).toBe(false)
        controller.abort()
        expect(signal?.aborted).toBe(true)
    })

    it("still sends a timeout signal when the caller passes none", async () => {
        const fetch = FakeFetch.of({ [URL_ONE]: { body: { ok: true } } })
        await clientOf(fetch).get("one")
        expect(fetch.inits[0]?.signal).toBeInstanceOf(AbortSignal)
    })

    it("reports its origin", () => {
        expect(clientOf(new FakeFetch()).origin).toBe(ORIGIN)
    })
})

describe("NoCache", () => {
    it("never returns anything", () => {
        const cache = new NoCache()
        cache.set("a", 1, 1000)
        expect(cache.get("a")).toBeUndefined()
    })
})
