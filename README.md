<p align="center">
  <img src="https://raw.githubusercontent.com/Akayashuu/enderbot-sdk/main/assets/banner.png" alt="enderbot-sdk" width="900">
</p>

<p align="center">
  <a href="https://github.com/Akayashuu/enderbot-sdk/actions/workflows/ci.yml"><img src="https://github.com/Akayashuu/enderbot-sdk/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/enderbot-sdk"><img src="https://img.shields.io/npm/v/enderbot-sdk?color=7c3aed&labelColor=1e1b4b" alt="npm"></a>
  <a href="https://www.npmjs.com/package/enderbot-sdk"><img src="https://img.shields.io/npm/types/enderbot-sdk?color=7c3aed&labelColor=1e1b4b" alt="types"></a>
  <img src="https://img.shields.io/badge/dependencies-0-7c3aed?labelColor=1e1b4b" alt="zero dependencies">
  <img src="https://img.shields.io/badge/runtime-Node%2022%2B%20%7C%20Bun%201.2%2B-7c3aed?labelColor=1e1b4b" alt="runtimes">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/enderbot-sdk?color=7c3aed&labelColor=1e1b4b" alt="licence"></a>
</p>

Typed TypeScript client for the public EnderBot wiki JSON API (`https://ender.gg/wiki/json/...`).

Zero runtime dependencies, ESM and CommonJS with declarations for both, a crawler and a local
search on top of an API that offers neither, and a terminal binary in the box.

## Install

```bash
npm  install enderbot-sdk
bun  add     enderbot-sdk
pnpm add     enderbot-sdk
yarn add     enderbot-sdk
```

| | |
|---|---|
| Runtimes | Node 22 or later, Bun 1.2 or later, and anything else with a global `fetch` (Deno, workers, the browser) |
| Formats | ESM (`import`) and CommonJS (`require`), each with its own declarations |
| Types | TypeScript 7, `strict`, no `any` anywhere in `src` |
| Dependencies | none |
| Binary | `enderbot-wiki` |

```js
const { WikiClient } = require("enderbot-sdk")
```

## Quick start

```ts
import { WikiClient } from "enderbot-sdk"

const wiki = new WikiClient({ locale: "fr" })

const root = await wiki.root()
console.log(root.counts.item, root.generatedFrom)

const carrot = await wiki.item("carrot")
console.log(wiki.text.of(carrot.name), carrot.data.sellPrice)

const cat = await wiki.pet("pet:cat")
console.log(cat.data.rarity, cat.data.skins.length)
```

## The API in one page

One endpoint answers every path: `GET /wiki/json/<path>`. Four document shapes, keyed by `kind`:

| `kind` | Shape | Example path |
|---|---|---|
| one of the 11 entity types | `id`, `canonical`, `data`, `relatedDrops`, `children` | `items/carrot`, `pets/cat` |
| `category` | `children` only | `items`, `areas/abyss_trench/drops` |
| `category` at the root | plus `generatedFrom` and `counts` | `` (empty path) |
| `guide` | `blocks` | `guides/economy/trading` |

Every shape also carries `version`, `path`, `name`, `description`. Names and descriptions are
`Record<locale, string>` over `en`, `es`, `fr`, `pt`, `pt_br`.

## Reading documents

```ts
await wiki.document("items/carrot")     // WikiDocument, throws WikiPageNotFoundError on 404
await wiki.tryDocument("items/nope")    // null instead of throwing
await wiki.exists("items/carrot")       // boolean
await wiki.children("recipes")          // WikiChild[]

await wiki.root()                       // WikiRootDocument
await wiki.counts()                     // Record<WikiEntityType, number>
await wiki.category("items")            // throws WikiKindMismatchError if it is not one
await wiki.guide("guides/economy/trading")
await wiki.entity("pets/cat")
await wiki.entityOfKind("pet", "pets/cat")   // narrows data to WikiPetData
```

## Finding an entity by id

Ids and paths do not line up: items use a bare id (`carrot`) while every other type is prefixed
(`pet:cat`, `recipe:furnace:adamantite_ingot`, `drop:abyss_trench:dig:gravel`), and a tool lives
under `tools/<category>/<id>` while carrying `type: "item"`. `resolve` handles that: it first tries
the direct path (one request), then falls back to a crawled index.

```ts
await wiki.find("shop", "shop:capital_general")
await wiki.tryFind("npc", "unknown")     // null
await wiki.resolve("recipe", "recipe:furnace:adamantite_ingot")  // "recipes/furnace/adamantite_ingot"
```

One helper per entity type: `item`, `recipe`, `command`, `area`, `drop`, `pet`, `shop`, `npc`,
`region`, `concept`, `event`. Each accepts the prefixed id or the bare one.

## Walking the tree

```ts
const index = await wiki.index()        // crawled once, then memoized
index.size
index.byType("pet")
index.byPath("areas/abyss_trench")
index.childrenOf("items")
index.descendantsOf("areas")
index.byId("shop", "capital_general")

const partial = await wiki.walk("recipes", { concurrency: 16 })
```

`WikiCrawler` opens every `category` child, and opens `entity` children only for the types listed in
`openEntityTypes` (default `["area"]`). That default is what makes drops reachable, since an area
entity page owns a `drops` category child. Pass `openEntityTypes: []` for a fast partial index.

An index is plain data, so it can be persisted:

```ts
import { writeFileSync, readFileSync } from "node:fs"
import { WikiIndex } from "enderbot-sdk"

writeFileSync("index.json", JSON.stringify(index.toJSON()))
wiki.useIndex(WikiIndex.fromJSON(JSON.parse(readFileSync("index.json", "utf8"))))
```

## Searching

Search runs locally against the index. It is diacritic-insensitive and scores names, slugs, paths
and ids.

```ts
await wiki.search("carotte")
await wiki.search("abyss", { types: ["area", "region"], limit: 5 })
await wiki.search("ingot", { under: "recipes/furnace" })
```

## Localized text

```ts
const text = wiki.text                  // WikiText
text.of(document.name)                  // string or null, walks the chain down to en
text.or(document.name, "unnamed")
text.all(document.name)                 // the raw record
wiki.text.withLocale("pt_br")           // a new WikiText, pt_br then pt then en
```

A whole client can be derived instead, which shares the transport and the crawled index with the
one it came from, so a second locale costs no extra request:

```ts
const french = wiki.withLocale("fr")
french.text.of((await french.item("carrot")).name)   // "Carotte"
```

## Cancelling a read

Every read takes an optional `AbortSignal`, composed with the client's own timeout:

```ts
const controller = new AbortController()
setTimeout(() => controller.abort(), 500)

await wiki.document("items/carrot", { signal: controller.signal })
await wiki.find("pet", "cat", { signal: controller.signal })
```

## Options

```ts
new WikiClient({
    baseUrl: "https://ender.gg",
    basePath: "wiki/json",
    locale: "en",
    fallbackLocales: ["fr"],
    timeoutMs: 10_000,
    retries: 2,
    retryBackoffMs: 250,
    headers: { "x-app": "mine" },
    userAgent: "my-app/1.0",
    fetch: globalThis.fetch,
    cache: new MemoryCache(1024),
    defaultTtlMs: 300_000,
})
```

Responses are cached in process, honouring the endpoint's `cache-control` (300 s today). Pass
`cache: false` to disable it, or your own `CacheStore`. `fetch`, the cache, the clock and the sleeper
are all injectable, so the whole stack unit-tests offline.

Retries cover 408, 425, 429 and 5xx with an exponential backoff.

## Errors

| Class | Thrown when |
|---|---|
| `WikiPageNotFoundError` | the path answers 404 |
| `WikiEntityNotFoundError` | no path resolves for a type and id |
| `WikiKindMismatchError` | the page exists but is not the shape asked for |
| `HttpStatusError` | any other non-2xx, carries `status` and the parsed body |
| `HttpRequestError` | network failure or timeout, carries the attempt count |
| `HttpDecodeError` | the body was not JSON |

All extend `EnderbotSdkError`.

## CLI

```bash
npx    enderbot-wiki counts
bunx   enderbot-wiki get items/carrot --locale fr
npx    enderbot-wiki find pet cat
npx    enderbot-wiki search abyss --type area --limit 5
npx    enderbot-wiki tree recipes
npx    enderbot-wiki list shop --json
npx    enderbot-wiki paths areas --drops
```

Flags: `--locale`, `--json`, `--limit`, `--depth`, `--type` (repeatable), `--concurrency`,
`--drops`, `--base-url`, `--no-cache`, `--help`, `--version`. `ENDERBOT_WIKI_BASE_URL` and
`ENDERBOT_WIKI_LOCALE` set the defaults.

## Node and Bun

Both runtimes are first class, and neither is taken on faith: `scripts/runtime-check.mjs` starts a
stub wiki, then exercises the built ESM bundle, the built CommonJS bundle and the built binary on
whichever runtime invokes it. CI runs it on Node 22, 24, 26 and on Bun, so a regression on either
side fails the build.

```bash
npm run smoke        # ok enderbot-sdk@0.1.0 on node 26.4.0
npm run smoke:bun    # ok enderbot-sdk@0.1.0 on bun 1.4.2
```

## Examples

Runnable snippets live in [`examples/`](./examples): reading pages, crawling and searching,
locales, caching and cancellation. They are type-checked in CI, so they cannot rot.

## Development

```bash
npm install           # or: bun install
npm run lint
npm run typecheck     # TypeScript 7
npm test
npm run coverage
npm run test:live     # hits the real API
npm run build
npm run check         # everything CI runs
npm run check:bun     # the same, driven by Bun
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the conventions and the release steps, and
[CHANGELOG.md](./CHANGELOG.md) for what changed.

## Licence

MIT. The EnderBot artwork in [`assets/`](./assets) belongs to the EnderBot project and is used here
for its own SDK.
