import { describe, expect, it } from "vitest"
import type { WikiDocument } from "../src/wiki/contract/documents.js"
import { WikiCrawler, WikiIndex } from "../src/wiki/WikiIndex.js"
import { WikiPath } from "../src/wiki/WikiPath.js"
import { SearchText, WikiSearch } from "../src/wiki/WikiSearch.js"
import { WikiText } from "../src/wiki/WikiText.js"
import { WikiFixtures } from "./support/TestDoubles.js"

class FixtureSource {
    private readonly tree = WikiFixtures.tree()
    readonly opened: string[] = []

    document(path: string): Promise<WikiDocument> {
        this.opened.push(path)
        const document = this.tree[path]
        if (!document) return Promise.reject(new Error(`no page at ${path}`))
        return Promise.resolve(document)
    }
}

describe("WikiPath", () => {
    it("normalizes slashes", () => {
        expect(WikiPath.normalize("/items//carrot/")).toBe("items/carrot")
        expect(WikiPath.normalize("  ")).toBe("")
    })

    it("splits and rebuilds", () => {
        expect(WikiPath.segments("items/carrot")).toEqual(["items", "carrot"])
        expect(WikiPath.segments("")).toEqual([])
        expect(WikiPath.join("wiki/json", "/items/carrot")).toBe("wiki/json/items/carrot")
    })

    it("walks upwards", () => {
        expect(WikiPath.parent("items/carrot")).toBe("items")
        expect(WikiPath.parent("items")).toBe("")
        expect(WikiPath.parent("")).toBeNull()
        expect(WikiPath.ancestors("a/b/c")).toEqual(["", "a", "a/b"])
        expect(WikiPath.slug("items/carrot")).toBe("carrot")
    })

    it("knows containment, the root holding everything", () => {
        expect(WikiPath.contains("items", "items/carrot")).toBe(true)
        expect(WikiPath.contains("items", "items")).toBe(false)
        expect(WikiPath.contains("", "items")).toBe(true)
        expect(WikiPath.contains("", "")).toBe(false)
    })

    it("strips an id prefix", () => {
        expect(WikiPath.bareId("recipe:furnace:iron_ingot")).toBe("iron_ingot")
        expect(WikiPath.bareId("carrot")).toBe("carrot")
    })

    it("guesses the path of a prefixed id", () => {
        expect(WikiPath.guesses("item", "carrot")).toEqual(["items/carrot"])
        expect(WikiPath.guesses("pet", "pet:cat")).toEqual(["pets/cat"])
        expect(WikiPath.guesses("pet", "cat")).toEqual(["pets/cat"])
        expect(WikiPath.guesses("recipe", "recipe:furnace:iron_ingot")).toEqual([
            "recipes/furnace/iron_ingot",
        ])
        expect(WikiPath.guesses("drop", "drop:abyss_trench:dig:gravel")).toEqual([
            "areas/abyss_trench/drops/dig/gravel",
        ])
    })

    it("has no guess for a type without a section", () => {
        expect(WikiPath.guesses("concept", "concept:mana")).toEqual([])
    })
})

describe("WikiText", () => {
    const name = { en: "Carrot", fr: "Carotte", pt: "Cenoura" }

    it("reads the requested locale", () => {
        expect(new WikiText("fr").of(name)).toBe("Carotte")
    })

    it("broadens a regional locale before falling back", () => {
        expect(new WikiText("pt_br").locales).toEqual(["pt_br", "pt", "en"])
        expect(new WikiText("pt_br").of(name)).toBe("Cenoura")
    })

    it("falls back to english then to anything present", () => {
        expect(new WikiText("es").of(name)).toBe("Carrot")
        expect(new WikiText("es").of({ fr: "Carotte" })).toBe("Carotte")
    })

    it("answers null on nothing", () => {
        expect(new WikiText().of(null)).toBeNull()
        expect(new WikiText().or(null, "unnamed")).toBe("unnamed")
        expect(new WikiText().orEmpty(undefined)).toBe("")
    })

    it("lists every translation", () => {
        expect(new WikiText().all(name)).toEqual(["Carrot", "Carotte", "Cenoura"])
    })

    it("derives a new locale keeping the old chain as fallback", () => {
        expect(new WikiText("fr").withLocale("es").locales).toEqual(["es", "en"])
    })
})

describe("WikiCrawler", () => {
    it("opens categories and area entities, reaching the drops", async () => {
        const source = new FixtureSource()
        const index = await new WikiCrawler(source).crawl()
        expect(index.byPath("areas/abyss_trench/drops/dig/gravel")).toBeDefined()
        expect(index.byType("drop")).toHaveLength(1)
        expect(source.opened).toContain("areas/abyss_trench")
    })

    it("leaves entity pages closed when no type is opened", async () => {
        const source = new FixtureSource()
        const index = await new WikiCrawler(source).crawl({ openEntityTypes: [] })
        expect(source.opened).not.toContain("areas/abyss_trench")
        expect(index.byType("drop")).toHaveLength(0)
        expect(index.byType("area")).toHaveLength(1)
    })

    it("stops at the requested depth", async () => {
        const index = await new WikiCrawler(new FixtureSource()).crawl({ maxDepth: 1 })
        expect(index.byPath("items")).toBeDefined()
        expect(index.byPath("items/carrot")).toBeUndefined()
    })

    it("crawls a subtree only", async () => {
        const index = await new WikiCrawler(new FixtureSource()).crawl({ root: "pets" })
        expect(index.size).toBe(1)
        expect(index.byPath("pets/cat")).toBeDefined()
    })

    it("reports a dead branch instead of failing the crawl", async () => {
        const failures: string[] = []
        const source = new FixtureSource()
        const index = await new WikiCrawler({
            document: (path: string) =>
                path === "items" ? Promise.reject(new Error("boom")) : source.document(path),
        }).crawl({ onError: (path) => failures.push(path) })
        expect(failures).toEqual(["items"])
        expect(index.byPath("pets/cat")).toBeDefined()
    })
})

describe("WikiIndex", () => {
    const indexOf = () => new WikiCrawler(new FixtureSource()).crawl()

    it("looks an entity up by full or bare id", async () => {
        const index = await indexOf()
        expect(index.byId("pet", "pet:cat")?.path).toBe("pets/cat")
        expect(index.byId("pet", "cat")?.path).toBe("pets/cat")
        expect(index.byId("pet", "dog")).toBeUndefined()
    })

    it("groups by parent and by subtree", async () => {
        const index = await indexOf()
        expect(index.childrenOf("items").map((node) => node.slug)).toEqual(["carrot"])
        expect(index.descendantsOf("areas").length).toBeGreaterThan(1)
        expect(index.entities().every((node) => node.type !== null)).toBe(true)
    })

    it("survives a round trip through JSON", async () => {
        const index = await indexOf()
        const revived = WikiIndex.fromJSON(JSON.parse(JSON.stringify(index.toJSON())))
        expect(revived.size).toBe(index.size)
        expect(revived.byId("item", "carrot")?.path).toBe("items/carrot")
    })

    it("tallies what it holds", async () => {
        expect((await indexOf()).counts().pet).toBe(1)
    })
})

describe("SearchText", () => {
    it("folds diacritics, case and separators", () => {
        expect(SearchText.normalize("Fosse Abyssale")).toBe("fosse abyssale")
        expect(SearchText.normalize("abyss_trench")).toBe("abyss trench")
        expect(SearchText.tokens("")).toEqual([])
    })
})

describe("WikiSearch", () => {
    const searchOf = async () => new WikiSearch(await new WikiCrawler(new FixtureSource()).crawl())

    it("finds a translated name without diacritics", async () => {
        const hits = await (await searchOf()).run("fosse abyssale")
        expect(hits[0]?.node.path).toBe("areas/abyss_trench")
    })

    it("ranks an exact match above a substring", async () => {
        const hits = await (await searchOf()).run("cat")
        expect(hits[0]?.node.path).toBe("pets/cat")
    })

    it("filters by type", async () => {
        const hits = await (await searchOf()).run("gravel", { types: ["item"] })
        expect(hits).toHaveLength(0)
    })

    it("filters by subtree", async () => {
        const hits = await (await searchOf()).run("gravel", { under: "areas" })
        expect(hits[0]?.node.type).toBe("drop")
    })

    it("caps the hits", async () => {
        const hits = await (await searchOf()).run("a", { limit: 1 })
        expect(hits.length).toBeLessThanOrEqual(1)
    })

    it("answers nothing on an empty query", async () => {
        expect(await (await searchOf()).run("   ")).toEqual([])
    })
})
