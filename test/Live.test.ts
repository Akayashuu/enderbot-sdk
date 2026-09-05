import { describe, expect, it } from "vitest"
import { WikiDocuments } from "../src/wiki/contract/documents.js"
import { WikiClient } from "../src/wiki/WikiClient.js"

const live = process.env.ENDERBOT_SDK_LIVE === "1" ? describe : describe.skip

live("live wiki API", () => {
    const wiki = new WikiClient()

    it("serves the root with counts", async () => {
        const root = await wiki.root()
        expect(root.version).toBeGreaterThan(0)
        expect(root.generatedFrom.length).toBeGreaterThan(0)
        expect(root.counts.item).toBeGreaterThan(0)
        expect(root.children.length).toBeGreaterThan(5)
    }, 30_000)

    it("serves an item page", async () => {
        const carrot = await wiki.item("carrot")
        expect(carrot.kind).toBe("item")
        expect(WikiDocuments.isEntity(carrot)).toBe(true)
        expect(wiki.text.of(carrot.name)).toBeTruthy()
    }, 30_000)

    it("answers 404 on an unknown page", async () => {
        expect(await wiki.tryDocument("items/definitely_not_a_thing")).toBeNull()
    }, 30_000)

    it("walks a section", async () => {
        const index = await wiki.walk("pets", { openEntityTypes: [] })
        expect(index.size).toBeGreaterThan(0)
        expect(index.byType("pet").length).toBeGreaterThan(0)
    }, 60_000)
})
