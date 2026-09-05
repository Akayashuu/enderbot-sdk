import { WikiClient, WikiDocuments } from "enderbot-sdk"

const wiki = new WikiClient({ locale: "fr" })

const carrot = await wiki.item("carrot")
console.log(wiki.text.of(carrot.name), carrot.path)

const page = await wiki.document("areas/abyss_trench")
if (WikiDocuments.isEntity(page)) {
    console.log(page.id, page.children.length, "children")
}

const missing = await wiki.tryDocument("items/definitely_not_a_thing")
console.log(missing === null ? "no such page" : "found")

const root = await wiki.root()
console.log(`dataset ${root.generatedFrom}, ${root.counts.item} items`)
