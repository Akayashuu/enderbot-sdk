import { MemoryCache, SystemClock, WikiClient } from "enderbot-sdk"

const wiki = new WikiClient({
    locale: "en",
    cache: new MemoryCache(2048, new SystemClock()),
    timeoutMs: 5_000,
    retries: 3,
})

const french = wiki.withLocale("fr")
const carrot = await french.item("carrot")
console.log(wiki.text.of(carrot.name), french.text.of(carrot.name))

const controller = new AbortController()
setTimeout(() => controller.abort(), 200)

try {
    await wiki.walk("items")
    console.log(await wiki.document("items/carrot", { signal: controller.signal }))
} catch (error) {
    console.error("read aborted", error)
}

wiki.clearCache()
