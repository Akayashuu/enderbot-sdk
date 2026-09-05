import { PassThrough } from "node:stream"
import { describe, expect, it } from "vitest"
import { CliArguments, type CliOutput, ConsoleOutput, WikiCli } from "../src/cli/Cli.js"
import { WikiFixtures } from "./support/TestDoubles.js"

class RecordingOutput implements CliOutput {
    readonly lines: string[] = []
    readonly errors: string[] = []

    out(line: string): void {
        this.lines.push(line)
    }

    err(line: string): void {
        this.errors.push(line)
    }

    get text(): string {
        return this.lines.join("\n")
    }
}

const run = async (...argv: string[]) => {
    const output = new RecordingOutput()
    const code = await new WikiCli(output, WikiFixtures.fetch().handler).run([
        ...argv,
        "--base-url",
        WikiFixtures.ORIGIN,
    ])
    return { output, code }
}

describe("ConsoleOutput", () => {
    const streams = () => ({ out: new PassThrough(), err: new PassThrough() })

    it("writes a line to each stream", async () => {
        const { out, err } = streams()
        const console = new ConsoleOutput(out, err)
        console.out("hello")
        console.err("boom")
        expect(out.read().toString()).toBe("hello\n")
        expect(err.read().toString()).toBe("boom\n")
    })

    it("goes quiet on a broken pipe instead of crashing", () => {
        const { out, err } = streams()
        const console = new ConsoleOutput(out, err)
        out.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" }))
        console.out("swallowed")
        expect(out.read()).toBeNull()
    })

    it("lets any other stream failure through", () => {
        const { out, err } = streams()
        new ConsoleOutput(out, err)
        expect(() => out.emit("error", new Error("disk on fire"))).toThrow("disk on fire")
    })
})

describe("CliArguments", () => {
    it("splits the command from its operands", () => {
        const args = CliArguments.parse(["get", "items/carrot"])
        expect(args.command).toBe("get")
        expect(args.operands).toEqual(["items/carrot"])
    })

    it("reads a flag value inline or apart", () => {
        expect(CliArguments.parse(["get", "--locale=fr"]).flags.locale).toBe("fr")
        expect(CliArguments.parse(["get", "-l", "pt_br"]).flags.locale).toBe("pt_br")
    })

    it("collects repeatable types", () => {
        expect(CliArguments.parse(["search", "-t", "area", "-t", "pet"]).flags.types).toEqual([
            "area",
            "pet",
        ])
    })

    it("reads the numeric flags", () => {
        const flags = CliArguments.parse([
            "tree",
            "--depth",
            "2",
            "--concurrency",
            "4",
            "-n",
            "5",
        ]).flags
        expect(flags.depth).toBe(2)
        expect(flags.concurrency).toBe(4)
        expect(flags.limit).toBe(5)
    })

    it("reads the short and negative forms", () => {
        expect(CliArguments.parse(["get", "-j", "--no-drops"]).flags.drops).toBe(false)
        expect(CliArguments.parse(["get", "-j"]).flags.json).toBe(true)
        expect(CliArguments.parse(["get", "-h"]).flags.help).toBe(true)
        expect(CliArguments.parse(["get", "-v"]).flags.version).toBe(true)
    })

    it("reads the boolean flags", () => {
        const flags = CliArguments.parse(["get", "--json", "--no-cache", "--drops"]).flags
        expect(flags.json).toBe(true)
        expect(flags.cache).toBe(false)
        expect(flags.drops).toBe(true)
    })

    it("falls back to help with no command", () => {
        expect(CliArguments.parse([]).command).toBe("help")
        expect(CliArguments.parse(["--version"]).command).toBe("version")
    })

    it("refuses an unknown flag, an unknown type and a missing value", () => {
        expect(() => CliArguments.parse(["get", "--nope"])).toThrow()
        expect(() => CliArguments.parse(["search", "-t", "wizard"])).toThrow()
        expect(() => CliArguments.parse(["get", "--locale"])).toThrow()
        expect(() => CliArguments.parse(["get", "--limit", "abc"])).toThrow()
    })
})

describe("WikiCli", () => {
    it("prints the usage", async () => {
        const { output, code } = await run("help")
        expect(code).toBe(0)
        expect(output.text).toContain("Usage: enderbot-wiki")
    })

    it("gets a page in the asked locale", async () => {
        const { output, code } = await run("get", "items/carrot", "--locale", "fr")
        expect(code).toBe(0)
        expect(output.text).toContain("Carotte")
        expect(output.text).toContain("/items/carrot")
    })

    it("prints raw json when asked", async () => {
        const { output } = await run("get", "pets/cat", "--json")
        expect(JSON.parse(output.text).id).toBe("pet:cat")
    })

    it("finds an entity by id", async () => {
        const { output, code } = await run("find", "pet", "cat")
        expect(code).toBe(0)
        expect(output.text).toContain("pets/cat")
    })

    it("lists the children of a page", async () => {
        const { output } = await run("children", "items", "--json")
        expect(JSON.parse(output.text)).toHaveLength(1)
    })

    it("lists every entity of a type", async () => {
        const { output } = await run("list", "pet", "--json")
        expect(JSON.parse(output.text)[0].path).toBe("pets/cat")
    })

    it("searches the tree", async () => {
        const { output } = await run("search", "carrot", "--json")
        expect(JSON.parse(output.text)[0].node.path).toBe("items/carrot")
    })

    it("prints the counts", async () => {
        const { output } = await run("counts")
        expect(output.text).toContain("deadbeef")
        expect(output.text).toContain("item")
    })

    it("prints every path of a subtree", async () => {
        const { output } = await run("paths", "areas", "--drops")
        expect(output.lines).toContain("areas/abyss_trench/drops/dig/gravel")
    })

    it("prints a tree", async () => {
        const { output } = await run("tree", "items")
        expect(output.text).toContain("carrot")
    })

    it("prints its own version, wherever the flag sits", async () => {
        const { output, code } = await run("version")
        expect(code).toBe(0)
        expect(output.text).toMatch(/^\d+\.\d+\.\d+$/)
        expect((await run("get", "items/carrot", "-v")).output.text).toBe(output.text)
    })

    it("prints the usage on the help flag after a command", async () => {
        const { output } = await run("get", "items/carrot", "-h")
        expect(output.text).toContain("Usage: enderbot-wiki")
    })

    it("prints a guide and its block count", async () => {
        const { output } = await run("get", "guides/economy")
        expect(output.text).toContain("blocks")
    })

    it("prints the root with its counts", async () => {
        const { output } = await run("get", "")
        expect(output.text).toContain("item")
    })

    it("says so when a search finds nothing", async () => {
        const { output } = await run("search", "zzzz")
        expect(output.text).toContain("no match")
    })

    it("reports an unknown entity as a failure", async () => {
        const { code, output } = await run("find", "pet", "dog")
        expect(code).toBe(1)
        expect(output.errors[0]).toContain("dog")
    })

    it("prints the counts as json", async () => {
        const { output } = await run("counts", "--json")
        expect(JSON.parse(output.text).generatedFrom).toBe("deadbeef")
    })

    it("lists the root children when no path is given", async () => {
        const { output } = await run("children")
        expect(output.text).toContain("3 entries")
    })

    it("counts a single child in the singular", async () => {
        const { output } = await run("children", "items")
        expect(output.text).toContain("1 entry")
    })

    it("needs a type to list", async () => {
        const { code, output } = await run("list")
        expect(code).toBe(2)
        expect(output.errors[0]).toContain("list <type>")
    })

    it("refuses an unknown entity type", async () => {
        const { code, output } = await run("list", "wizard")
        expect(code).toBe(2)
        expect(output.errors[0]).toContain("wizard")
    })

    it("reports an unknown command as a usage error", async () => {
        const { output, code } = await run("dance")
        expect(code).toBe(2)
        expect(output.errors[0]).toContain("dance")
    })

    it("reports a missing page as a failure", async () => {
        const { output, code } = await run("get", "items/nope")
        expect(code).toBe(1)
        expect(output.errors[0]).toContain("items/nope")
    })

    it("needs both operands to find", async () => {
        const { code } = await run("find", "pet")
        expect(code).toBe(2)
    })
})
