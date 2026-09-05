import type { FetchLike } from "../http/HttpClient.js"
import { EnderbotSdkError } from "../http/HttpErrors.js"
import { SdkVersion } from "../Version.js"
import type { WikiDocument } from "../wiki/contract/documents.js"
import { WikiDocuments } from "../wiki/contract/documents.js"
import type { WikiEntityType } from "../wiki/contract/primitives.js"
import { WIKI_ENTITY_TYPES } from "../wiki/contract/primitives.js"
import { WikiClient } from "../wiki/WikiClient.js"
import type { WikiIndex, WikiIndexNode } from "../wiki/WikiIndex.js"
import { WikiCrawler } from "../wiki/WikiIndex.js"
import { WikiPath } from "../wiki/WikiPath.js"
import type { WikiSearchHit } from "../wiki/WikiSearch.js"
import { WikiText } from "../wiki/WikiText.js"

export interface CliOutput {
    out(line: string): void
    err(line: string): void
}

export class ConsoleOutput implements CliOutput {
    private readonly stdout: NodeJS.WritableStream
    private readonly stderr: NodeJS.WritableStream
    private broken = false

    constructor(
        stdout: NodeJS.WritableStream = process.stdout,
        stderr: NodeJS.WritableStream = process.stderr,
    ) {
        this.stdout = stdout
        this.stderr = stderr
        this.silenceBrokenPipe(stdout)
        this.silenceBrokenPipe(stderr)
    }

    out(line: string): void {
        this.write(this.stdout, line)
    }

    err(line: string): void {
        this.write(this.stderr, line)
    }

    private write(stream: NodeJS.WritableStream, line: string): void {
        if (this.broken) return
        stream.write(`${line}\n`)
    }

    private silenceBrokenPipe(stream: NodeJS.WritableStream): void {
        stream.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code !== "EPIPE") throw error
            this.broken = true
        })
    }
}

export interface CliFlags {
    locale: string
    json: boolean
    limit: number
    depth: number
    concurrency: number
    types: WikiEntityType[]
    baseUrl: string | undefined
    cache: boolean
    drops: boolean
    help: boolean
    version: boolean
}

export class CliArguments {
    readonly command: string
    readonly operands: string[]
    readonly flags: CliFlags

    private constructor(command: string, operands: string[], flags: CliFlags) {
        this.command = command
        this.operands = operands
        this.flags = flags
    }

    static parse(argv: readonly string[]): CliArguments {
        const operands: string[] = []
        const flags: CliFlags = CliArguments.defaults()

        for (let position = 0; position < argv.length; position += 1) {
            const token = argv[position] ?? ""
            if (!token.startsWith("-")) {
                operands.push(token)
                continue
            }
            position = CliArguments.applyFlag(token, argv, position, flags)
        }

        const command = operands.shift() ?? (flags.version ? "version" : "help")
        return new CliArguments(command, operands, flags)
    }

    private static applyFlag(
        token: string,
        argv: readonly string[],
        position: number,
        flags: CliFlags,
    ): number {
        const [name, inlineValue] = CliArguments.split(token)
        const readValue = (): string => {
            if (inlineValue !== undefined) return inlineValue
            const next = argv[position + 1]
            if (next === undefined) throw new CliUsageError(`Flag ${name} needs a value`)
            position += 1
            return next
        }

        switch (name) {
            case "--locale":
            case "-l":
                flags.locale = readValue()
                break
            case "--limit":
            case "-n":
                flags.limit = CliArguments.number(name, readValue())
                break
            case "--depth":
            case "-d":
                flags.depth = CliArguments.number(name, readValue())
                break
            case "--concurrency":
                flags.concurrency = CliArguments.number(name, readValue())
                break
            case "--type":
            case "-t":
                flags.types.push(CliArguments.entityType(readValue()))
                break
            case "--base-url":
                flags.baseUrl = readValue()
                break
            case "--json":
            case "-j":
                flags.json = true
                break
            case "--no-cache":
                flags.cache = false
                break
            case "--drops":
                flags.drops = true
                break
            case "--no-drops":
                flags.drops = false
                break
            case "--help":
            case "-h":
                flags.help = true
                break
            case "--version":
            case "-v":
                flags.version = true
                break
            default:
                throw new CliUsageError(`Unknown flag ${name}`)
        }
        return position
    }

    private static split(token: string): [string, string | undefined] {
        const equals = token.indexOf("=")
        if (equals === -1) return [token, undefined]
        return [token.slice(0, equals), token.slice(equals + 1)]
    }

    private static number(name: string, raw: string): number {
        const value = Number(raw)
        if (!Number.isFinite(value)) throw new CliUsageError(`Flag ${name} needs a number`)
        return value
    }

    private static entityType(raw: string): WikiEntityType {
        const match = WIKI_ENTITY_TYPES.find((type) => type === raw)
        if (!match) {
            throw new CliUsageError(
                `Unknown entity type "${raw}", expected one of ${WIKI_ENTITY_TYPES.join(", ")}`,
            )
        }
        return match
    }

    private static defaults(): CliFlags {
        return {
            locale: process.env.ENDERBOT_WIKI_LOCALE ?? WikiText.DEFAULT_LOCALE,
            json: false,
            limit: 20,
            depth: Number.POSITIVE_INFINITY,
            concurrency: 8,
            types: [],
            baseUrl: process.env.ENDERBOT_WIKI_BASE_URL,
            cache: true,
            drops: false,
            help: false,
            version: false,
        }
    }
}

export class CliUsageError extends EnderbotSdkError {}

export class CliPrinter {
    private readonly output: CliOutput
    private readonly text: WikiText

    constructor(output: CliOutput, text: WikiText) {
        this.output = output
        this.text = text
    }

    json(value: unknown): void {
        this.output.out(JSON.stringify(value, null, 2))
    }

    document(document: WikiDocument, url: string): void {
        this.output.out(this.text.or(document.name, document.path || "wiki"))
        this.output.out(`  kind      ${document.kind}`)
        this.output.out(`  path      /${document.path}`)
        this.output.out(`  url       ${url}`)
        if (WikiDocuments.isEntity(document)) this.output.out(`  id        ${document.id}`)
        const description = this.text.of(document.description)
        if (description) this.output.out(`  about     ${description}`)
        if (WikiDocuments.isRoot(document)) this.counts(document.counts)
        if (WikiDocuments.isEntity(document)) this.data(document.data)
        if (WikiDocuments.isGuide(document)) {
            this.output.out(`  blocks    ${document.blocks.length}`)
        }
        if (document.children.length > 0) {
            this.output.out(`  children  ${document.children.length}`)
            for (const child of document.children) {
                this.output.out(`    ${child.path.padEnd(48)} ${this.text.orEmpty(child.name)}`)
            }
        }
    }

    nodes(nodes: readonly WikiIndexNode[]): void {
        for (const node of nodes) {
            const label = this.text.orEmpty(node.name)
            this.output.out(
                `${(node.type ?? node.kind).padEnd(9)} ${node.path.padEnd(52)} ${label}`,
            )
        }
        this.output.out(`${nodes.length} entr${nodes.length === 1 ? "y" : "ies"}`)
    }

    hits(hits: readonly WikiSearchHit[]): void {
        for (const hit of hits) {
            const label = this.text.orEmpty(hit.node.name) || hit.node.slug
            const type = hit.node.type ?? hit.node.kind
            this.output.out(
                `${String(hit.score).padStart(4)}  ${type.padEnd(9)} ${hit.node.path.padEnd(52)} ${label}`,
            )
        }
        if (hits.length === 0) this.output.out("no match")
    }

    tree(index: WikiIndex, root: string): void {
        const base = WikiPath.segments(root).length
        for (const node of index.descendantsOf(root)) {
            const indent = "  ".repeat(Math.max(0, node.depth - base - 1))
            const label = this.text.orEmpty(node.name) || node.slug
            this.output.out(
                `${indent}${node.slug.padEnd(Math.max(4, 36 - indent.length))} ${label}`,
            )
        }
    }

    counts(counts: Record<string, number>): void {
        for (const [key, value] of Object.entries(counts)) {
            this.output.out(`  ${key.padEnd(9)} ${String(value).padStart(5)}`)
        }
    }

    private data(data: unknown): void {
        const rendered = JSON.stringify(data, null, 2)
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")
        this.output.out("  data")
        this.output.out(rendered)
    }
}

export class WikiCli {
    private readonly output: CliOutput
    private readonly fetch: FetchLike | undefined

    constructor(output: CliOutput = new ConsoleOutput(), fetch?: FetchLike) {
        this.output = output
        this.fetch = fetch
    }

    async run(argv: readonly string[]): Promise<number> {
        try {
            const args = CliArguments.parse(argv)
            if (args.flags.help || args.command === "help") return this.help()
            if (args.flags.version || args.command === "version") return this.version()
            return await this.dispatch(args)
        } catch (error) {
            this.output.err(WikiCli.messageOf(error))
            return error instanceof CliUsageError ? 2 : 1
        }
    }

    private async dispatch(args: CliArguments): Promise<number> {
        const client = this.clientOf(args)
        const printer = new CliPrinter(this.output, client.text)

        switch (args.command) {
            case "get":
                return this.get(client, printer, args)
            case "children":
                return this.children(client, printer, args)
            case "find":
                return this.find(client, printer, args)
            case "list":
                return this.list(client, printer, args)
            case "search":
                return this.search(client, printer, args)
            case "tree":
                return this.tree(client, printer, args)
            case "paths":
                return this.paths(client, printer, args)
            case "counts":
                return this.counts(client, printer, args)
            default:
                throw new CliUsageError(`Unknown command "${args.command}"`)
        }
    }

    private async get(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const path = args.operands[0] ?? WikiPath.ROOT
        const document = await client.document(path)
        if (args.flags.json) printer.json(document)
        else printer.document(document, client.urlOf(document.path))
        return 0
    }

    private async children(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const path = args.operands[0] ?? WikiPath.ROOT
        const children = await client.children(path)
        if (args.flags.json) printer.json(children)
        else printer.nodes(children.map((child) => WikiCli.asNode(child, path)))
        return 0
    }

    private async find(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const [rawType, id] = args.operands
        if (!rawType || !id) throw new CliUsageError("Usage: enderbot-wiki find <type> <id>")
        const type = WikiCli.entityType(rawType)
        const document = await client.find(type, id)
        if (args.flags.json) printer.json(document)
        else printer.document(document, client.urlOf(document.path))
        return 0
    }

    private async list(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const rawType = args.operands[0]
        if (!rawType) throw new CliUsageError("Usage: enderbot-wiki list <type>")
        const index = await WikiCli.indexOf(client, args)
        const nodes = index.byType(WikiCli.entityType(rawType))
        if (args.flags.json) printer.json(nodes)
        else printer.nodes(nodes)
        return 0
    }

    private async search(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const query = args.operands.join(" ")
        if (query.length === 0) throw new CliUsageError("Usage: enderbot-wiki search <query>")
        const index = await WikiCli.indexOf(client, args)
        client.useIndex(index)
        const hits = await client.search(query, {
            limit: args.flags.limit,
            ...(args.flags.types.length > 0 ? { types: args.flags.types } : {}),
        })
        if (args.flags.json) printer.json(hits)
        else printer.hits(hits)
        return 0
    }

    private async tree(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const root = WikiPath.normalize(args.operands[0] ?? WikiPath.ROOT)
        const index = await WikiCli.indexOf(client, args, root)
        if (args.flags.json) printer.json(index.toJSON())
        else printer.tree(index, root)
        return 0
    }

    private async paths(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const root = WikiPath.normalize(args.operands[0] ?? WikiPath.ROOT)
        const index = await WikiCli.indexOf(client, args, root)
        const nodes = index.all()
        if (args.flags.json) printer.json(nodes.map((node) => node.path))
        else for (const node of nodes) this.output.out(node.path)
        return 0
    }

    private async counts(
        client: WikiClient,
        printer: CliPrinter,
        args: CliArguments,
    ): Promise<number> {
        const root = await client.root()
        if (args.flags.json) {
            printer.json({ generatedFrom: root.generatedFrom, counts: root.counts })
            return 0
        }
        this.output.out(`dataset ${root.generatedFrom} (version ${root.version})`)
        printer.counts(root.counts)
        return 0
    }

    private help(): number {
        for (const line of WikiCli.USAGE) this.output.out(line)
        return 0
    }

    private version(): number {
        this.output.out(SdkVersion.VALUE)
        return 0
    }

    private static async indexOf(
        client: WikiClient,
        args: CliArguments,
        root = WikiPath.ROOT,
    ): Promise<WikiIndex> {
        return client.walk(root, {
            concurrency: args.flags.concurrency,
            openEntityTypes: args.flags.drops ? WikiCrawler.DEFAULT_OPEN_TYPES : [],
            ...(Number.isFinite(args.flags.depth) ? { maxDepth: args.flags.depth } : {}),
        })
    }

    private clientOf(args: CliArguments): WikiClient {
        return new WikiClient({
            locale: args.flags.locale,
            ...(args.flags.baseUrl ? { baseUrl: args.flags.baseUrl } : {}),
            ...(args.flags.cache ? {} : { cache: false as const }),
            ...(this.fetch ? { fetch: this.fetch } : {}),
        })
    }

    private static asNode(
        child: {
            slug: string
            path: string
            kind: WikiIndexNode["kind"]
            type: WikiEntityType | null
            id: string | null
            canonical: string | null
            name: WikiIndexNode["name"]
        },
        parentPath: string,
    ): WikiIndexNode {
        return {
            path: child.path,
            slug: child.slug,
            kind: child.kind,
            type: child.type,
            id: child.id,
            canonical: child.canonical,
            name: child.name,
            parentPath,
            depth: WikiPath.segments(child.path).length,
        }
    }

    private static entityType(raw: string): WikiEntityType {
        const match = WIKI_ENTITY_TYPES.find((type) => type === raw)
        if (!match) {
            throw new CliUsageError(
                `Unknown entity type "${raw}", expected one of ${WIKI_ENTITY_TYPES.join(", ")}`,
            )
        }
        return match
    }

    private static messageOf(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
    }

    private static readonly USAGE: readonly string[] = [
        "enderbot-wiki, read the EnderBot wiki from the terminal",
        "",
        "Usage: enderbot-wiki <command> [operands] [flags]",
        "",
        "Commands:",
        "  get [path]            Fetch one wiki page",
        "  children [path]       List the direct children of a page",
        "  find <type> <id>      Resolve an entity by its id, then fetch its page",
        "  list <type>           List every entity of a type",
        "  search <query>        Search names, slugs and ids across the tree",
        "  tree [path]           Print the tree under a path",
        "  paths [path]          Print every path under a path, one per line",
        "  counts                Dataset counts and build hash",
        "",
        "Flags:",
        "  -l, --locale <code>   Language used for names (default en)",
        "  -j, --json            Print raw JSON instead of a reading layout",
        "  -n, --limit <n>       Cap the number of search hits (default 20)",
        "  -d, --depth <n>       Stop crawling under this depth",
        "  -t, --type <type>     Restrict a search to an entity type, repeatable",
        "      --concurrency <n> Parallel page fetches while crawling (default 8)",
        "      --drops           Open area pages so drops enter the index",
        "      --base-url <url>  Point at another host (default https://ender.gg)",
        "      --no-cache        Skip the in-process response cache",
        "  -h, --help            Show this help",
        "  -v, --version         Show the package version",
        "",
        "Environment: ENDERBOT_WIKI_BASE_URL, ENDERBOT_WIKI_LOCALE",
    ]
}
