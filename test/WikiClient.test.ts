import { describe, expect, it, vi } from "vitest"
import { WikiDocuments } from "../src/wiki/contract/documents.js"
import { WikiClient } from "../src/wiki/WikiClient.js"
import {
    WikiEntityNotFoundError,
    WikiKindMismatchError,
    WikiPageNotFoundError,
} from "../src/wiki/WikiErrors.js"
import { type FakeFetch, WikiFixtures } from "./support/TestDoubles.js"

const ENTITY_KINDS = [
    "item",
    "recipe",
    "command",
    "area",
    "drop",
    "pet",
    "shop",
    "npc",
    "region",
    "concept",
    "event",
] as const

const clientOf = (fetch: FakeFetch = WikiFixtures.fetch(), locale = "en") =>
    new WikiClient({ baseUrl: WikiFixtures.ORIGIN, locale, fetch: fetch.handler })

describe("WikiClient", () => {
    it("builds the endpoint url", () => {
        const client = clientOf()
        expect(client.baseUrl).toBe(WikiFixtures.ORIGIN)
        expect(client.urlOf("items/carrot")).toBe(`${WikiFixtures.ORIGIN}/wiki/json/items/carrot`)
        expect(client.urlOf("")).toBe(`${WikiFixtures.ORIGIN}/wiki/json`)
    })

    it("reads a page and tolerates a leading slash", async () => {
        const document = await clientOf().document("/items/carrot")
        expect(document.path).toBe("items/carrot")
    })

    it("turns a 404 into a page error", async () => {
        const error = await clientOf()
            .document("items/nope")
            .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(WikiPageNotFoundError)
        expect((error as WikiPageNotFoundError).path).toBe("items/nope")
    })

    it("answers null or false instead of throwing", async () => {
        const client = clientOf()
        expect(await client.tryDocument("items/nope")).toBeNull()
        expect(await client.exists("items/nope")).toBe(false)
        expect(await client.exists("items/carrot")).toBe(true)
    })

    it("reads the root counts and build hash", async () => {
        const client = clientOf()
        expect(await client.generatedFrom()).toBe("deadbeef")
        expect((await client.counts()).item).toBe(1)
    })

    it("narrows a document to its shape", async () => {
        const client = clientOf()
        expect((await client.category("items")).kind).toBe("category")
        expect((await client.guide("guides/economy")).blocks).toHaveLength(1)
        expect((await client.entityOfKind("pet", "pets/cat")).id).toBe("pet:cat")
    })

    it("refuses a document of the wrong shape", async () => {
        const error = await clientOf()
            .entityOfKind("item", "pets/cat")
            .catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(WikiKindMismatchError)
        expect((error as WikiKindMismatchError).actual).toBe("pet")
    })

    it("resolves an entity through the direct guess, in one request", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        const pet = await client.pet("pet:cat")
        expect(pet.path).toBe("pets/cat")
        expect(fetch.calls).toEqual([WikiFixtures.urlOf("pets/cat")])
    })

    it("falls back to the index when the guess misses", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        const drop = await client.drop("gravel")
        expect(drop.path).toBe("areas/abyss_trench/drops/dig/gravel")
    })

    it("reports an unknown entity", async () => {
        const client = clientOf()
        const error = await client.pet("dog").catch((thrown: unknown) => thrown)
        expect(error).toBeInstanceOf(WikiEntityNotFoundError)
        expect(await client.tryFind("pet", "dog")).toBeNull()
    })

    it("forwards every per-type shortcut to find", async () => {
        const client = clientOf()
        const found = vi.spyOn(client, "find").mockResolvedValue({} as never)
        for (const kind of ENTITY_KINDS) await client[kind]("x")
        expect(found.mock.calls.map(([kind]) => kind)).toEqual([...ENTITY_KINDS])
    })

    it("reads a bare entity and a guide without naming their kind", async () => {
        const client = clientOf()
        expect((await client.entity("items/carrot")).kind).toBe("item")
        await expect(client.entity("items")).rejects.toThrow()
        await expect(client.guide("items/carrot")).rejects.toThrow()
        await expect(client.category("items/carrot")).rejects.toThrow()
        await expect(client.root()).resolves.toBeTruthy()
    })

    it("crawls once and reuses the index", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        const first = await client.index()
        const second = await client.index()
        expect(second).toBe(first)
        expect(fetch.countOf(WikiFixtures.urlOf(""))).toBe(1)
    })

    it("lists and searches through the index", async () => {
        const client = clientOf(WikiFixtures.fetch(), "fr")
        expect((await client.list("pet")).map((node) => node.path)).toEqual(["pets/cat"])
        const hits = await client.search("carotte")
        expect(hits[0]?.node.path).toBe("items/carrot")
    })

    it("recrawls on refresh, keeping the fresh index", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        await client.index()
        const refreshed = await client.refreshIndex()
        expect(await client.index()).toBe(refreshed)
        expect(fetch.countOf(WikiFixtures.urlOf(""))).toBe(2)
        const scoped = await client.refreshIndex({ root: "pets" })
        expect(scoped.size).toBe(1)
        expect(await client.index()).toBe(scoped)
    })

    it("accepts an index built elsewhere", async () => {
        const client = clientOf()
        const index = await client.walk("pets", { openEntityTypes: [] })
        client.useIndex(index)
        expect(await client.list("pet")).toHaveLength(1)
        expect(await client.list("item")).toHaveLength(0)
    })

    it("localizes names through its own text reader", async () => {
        const client = clientOf(WikiFixtures.fetch(), "fr")
        const carrot = await client.item("carrot")
        expect(client.text.of(carrot.name)).toBe("Carotte")
    })

    it("derives a localized view sharing the transport and the index", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        await client.index()
        const french = client.withLocale("fr")
        const carrot = await french.item("carrot")
        expect(french.text.of(carrot.name)).toBe("Carotte")
        expect(client.text.of(carrot.name)).toBe("Carrot")
        expect(await french.list("item")).toHaveLength(1)
        expect(fetch.countOf(WikiFixtures.urlOf(""))).toBe(1)
    })

    it("aborts a read on the caller signal", async () => {
        const controller = new AbortController()
        controller.abort()
        const client = new WikiClient({
            baseUrl: WikiFixtures.ORIGIN,
            fetch: (_input: string, init?: RequestInit) =>
                init?.signal?.aborted
                    ? Promise.reject(new DOMException("aborted", "AbortError"))
                    : Promise.resolve(new Response("{}")),
            retries: 0,
        })
        await expect(
            client.document("items/carrot", { signal: controller.signal }),
        ).rejects.toThrow()
    })

    it("drops the cached index and pages on clear", async () => {
        const fetch = WikiFixtures.fetch()
        const client = clientOf(fetch)
        await client.document("pets/cat")
        client.clearCache()
        await client.document("pets/cat")
        expect(fetch.countOf(WikiFixtures.urlOf("pets/cat"))).toBe(2)
    })
})

describe("WikiDocuments", () => {
    it("sorts the four shapes apart", async () => {
        const client = clientOf()
        const root = await client.document("")
        const category = await client.document("items")
        const guide = await client.document("guides/economy")
        const entity = await client.document("pets/cat")

        expect(WikiDocuments.isRoot(root)).toBe(true)
        expect(WikiDocuments.isCategory(category)).toBe(true)
        expect(WikiDocuments.isRoot(category)).toBe(false)
        expect(WikiDocuments.isGuide(guide)).toBe(true)
        expect(WikiDocuments.isEntity(entity)).toBe(true)
        expect(WikiDocuments.isOfKind(entity, "pet")).toBe(true)
        expect(WikiDocuments.isOfKind(entity, "item")).toBe(false)
    })

    it("recognizes the not-found body", () => {
        expect(WikiDocuments.isNotFoundBody({ error: "not_found", path: "x" })).toBe(true)
        expect(WikiDocuments.isNotFoundBody({ error: "other" })).toBe(false)
    })
})
