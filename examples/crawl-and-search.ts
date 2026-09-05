import { readFile, writeFile } from "node:fs/promises"
import { WikiClient, WikiIndex } from "enderbot-sdk"

const wiki = new WikiClient({ locale: "fr" })

const index = await wiki.index()
console.log(`${index.size} nodes`, index.counts())

for (const hit of await wiki.search("essence", { types: ["item"], limit: 5 })) {
    console.log(hit.score, hit.node.path, wiki.text.orEmpty(hit.node.name))
}

await writeFile("wiki-index.json", JSON.stringify(index.toJSON()))

const revived = WikiIndex.fromJSON(JSON.parse(await readFile("wiki-index.json", "utf8")))
console.log(revived.size, revived.byId("pet", "cat")?.path)

wiki.useIndex(revived)
console.log((await wiki.list("area")).map((node) => node.path))
