import { spawn } from "node:child_process"
import { createServer } from "node:http"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")

class Runtime {
    static get name() {
        return globalThis.Bun ? "bun" : "node"
    }

    static get version() {
        return globalThis.Bun ? globalThis.Bun.version : process.versions.node
    }
}

class WikiStub {
    #server
    #documents

    constructor() {
        this.#documents = WikiStub.#pages()
        this.#server = createServer((request, response) => this.#answer(request, response))
    }

    async start() {
        await new Promise((done) => this.#server.listen(0, "127.0.0.1", done))
        const { port } = this.#server.address()
        return `http://127.0.0.1:${port}`
    }

    async stop() {
        await new Promise((done) => this.#server.close(done))
    }

    #answer(request, response) {
        const path = new URL(request.url, "http://stub").pathname.replace(/^\/wiki\/json\/?/, "")
        const document = this.#documents.get(path)
        const body = document ?? { error: "not_found", path }
        response.writeHead(document ? 200 : 404, {
            "content-type": "application/json",
            "cache-control": "public, max-age=300",
        })
        response.end(JSON.stringify(body))
    }

    static #pages() {
        const carrot = {
            version: 7,
            kind: "item",
            path: "items/carrot",
            id: "carrot",
            canonical: "items/carrot",
            name: { en: "Carrot", fr: "Carotte" },
            description: { en: "A carrot." },
            data: { rarity: "common" },
            relatedDrops: [],
            children: [],
        }
        const items = {
            version: 7,
            kind: "category",
            path: "items",
            name: { en: "Items" },
            description: null,
            children: [
                {
                    slug: "carrot",
                    path: "items/carrot",
                    kind: "entity",
                    type: "item",
                    id: "carrot",
                    canonical: "items/carrot",
                    name: { en: "Carrot", fr: "Carotte" },
                },
            ],
        }
        const root = {
            version: 7,
            kind: "category",
            path: "",
            name: { en: "Wiki" },
            description: null,
            generatedFrom: "stub",
            counts: { item: 1 },
            children: [
                {
                    slug: "items",
                    path: "items",
                    kind: "category",
                    type: null,
                    id: null,
                    canonical: null,
                    name: { en: "Items" },
                },
            ],
        }
        return new Map([
            ["", root],
            ["items", items],
            ["items/carrot", carrot],
        ])
    }
}

class Expectation {
    static equal(actual, expected, label) {
        if (actual !== expected) {
            throw new Error(
                `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
            )
        }
    }

    static contains(haystack, needle, label) {
        if (!haystack.includes(needle)) {
            throw new Error(
                `${label}: ${JSON.stringify(needle)} missing from ${JSON.stringify(haystack)}`,
            )
        }
    }
}

class RuntimeCheck {
    #baseUrl

    constructor(baseUrl) {
        this.#baseUrl = baseUrl
    }

    async run() {
        const version = await this.#esm()
        await this.#cjs(version)
        await this.#cli(version)
        return version
    }

    async #esm() {
        const entry = pathToFileURL(resolve(ROOT, "dist/index.js")).href
        const { WikiClient, SdkVersion, WikiDocuments } = await import(entry)
        const wiki = new WikiClient({ baseUrl: this.#baseUrl, locale: "fr" })

        const carrot = await wiki.item("carrot")
        Expectation.equal(wiki.text.of(carrot.name), "Carotte", "esm locale")
        Expectation.equal(WikiDocuments.isEntity(carrot), true, "esm guard")

        const root = await wiki.root()
        Expectation.equal(root.counts.item, 1, "esm root counts")

        const index = await wiki.index()
        Expectation.equal(index.byId("item", "carrot")?.path, "items/carrot", "esm index")

        const hits = await wiki.search("carotte")
        Expectation.equal(hits[0]?.node.path, "items/carrot", "esm search")

        Expectation.equal(await wiki.tryDocument("items/nope"), null, "esm 404")
        return SdkVersion.VALUE
    }

    async #cjs(version) {
        const require = createRequire(import.meta.url)
        const bundle = require(resolve(ROOT, "dist/index.cjs"))
        Expectation.equal(bundle.SdkVersion.VALUE, version, "cjs version")

        const wiki = new bundle.WikiClient({ baseUrl: this.#baseUrl })
        const carrot = await wiki.item("carrot")
        Expectation.equal(wiki.text.of(carrot.name), "Carrot", "cjs default locale")
    }

    async #cli(version) {
        const printed = await this.#spawn(["counts", "--base-url", this.#baseUrl])
        Expectation.contains(printed, "dataset stub", "cli counts")
        Expectation.contains(printed, "item", "cli counts row")

        Expectation.equal((await this.#spawn(["--version"])).trim(), version, "cli version")

        const found = await this.#spawn([
            "get",
            "items/carrot",
            "--base-url",
            this.#baseUrl,
            "--json",
        ])
        Expectation.equal(JSON.parse(found).id, "carrot", "cli json")
    }

    #spawn(args) {
        return new Promise((done, fail) => {
            const child = spawn(
                process.execPath,
                [resolve(ROOT, "dist/enderbot-wiki.js"), ...args],
                {
                    stdio: ["ignore", "pipe", "pipe"],
                },
            )
            let out = ""
            let err = ""
            child.stdout.on("data", (chunk) => {
                out += chunk
            })
            child.stderr.on("data", (chunk) => {
                err += chunk
            })
            child.on("error", fail)
            child.on("close", (code) => {
                if (code === 0) return done(out)
                fail(new Error(`cli ${args.join(" ")} exited ${code}\n${err}`))
            })
        })
    }
}

const stub = new WikiStub()
const baseUrl = await stub.start()
try {
    const version = await new RuntimeCheck(baseUrl).run()
    console.log(`ok enderbot-sdk@${version} on ${Runtime.name} ${Runtime.version}`)
} finally {
    await stub.stop()
}
