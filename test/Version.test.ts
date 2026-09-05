import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { JsonHttpClient } from "../src/http/HttpClient.js"
import { SdkVersion } from "../src/Version.js"
import { FakeFetch } from "./support/TestDoubles.js"

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    name: string
    version: string
}

describe("SdkVersion", () => {
    it("matches the published manifest", () => {
        expect(SdkVersion.NAME).toBe(manifest.name)
        expect(SdkVersion.VALUE).toBe(manifest.version)
    })

    it("is the default user agent", async () => {
        const fetch = FakeFetch.of({ "https://a.test/one": { body: {} } })
        await new JsonHttpClient({ baseUrl: "https://a.test", fetch: fetch.handler }).get("one")
        const headers = fetch.inits[0]?.headers as Record<string, string>
        expect(headers["user-agent"]).toBe(SdkVersion.userAgent)
    })
})
