import type { WikiChild, WikiDocument } from "./contract/documents.js"
import type { WikiEntityType, WikiLocalized, WikiTreeNodeKind } from "./contract/primitives.js"
import { WikiPath } from "./WikiPath.js"

export interface WikiDocumentSource {
    document(path: string): Promise<WikiDocument>
}

export interface WikiIndexNode {
    path: string
    slug: string
    kind: WikiTreeNodeKind
    type: WikiEntityType | null
    id: string | null
    canonical: string | null
    name: WikiLocalized | null
    parentPath: string | null
    depth: number
}

export class WikiIndex {
    private readonly nodes: readonly WikiIndexNode[]
    private readonly byPathIndex: ReadonlyMap<string, WikiIndexNode>
    private readonly byIdIndex: ReadonlyMap<string, WikiIndexNode>
    private readonly byParentIndex: ReadonlyMap<string, WikiIndexNode[]>

    constructor(nodes: readonly WikiIndexNode[]) {
        this.nodes = nodes
        this.byPathIndex = new Map(nodes.map((node) => [node.path, node]))
        this.byIdIndex = WikiIndex.buildIdIndex(nodes)
        this.byParentIndex = WikiIndex.buildParentIndex(nodes)
    }

    get size(): number {
        return this.nodes.length
    }

    all(): readonly WikiIndexNode[] {
        return this.nodes
    }

    byPath(path: string): WikiIndexNode | undefined {
        return this.byPathIndex.get(WikiPath.normalize(path))
    }

    byType(type: WikiEntityType): WikiIndexNode[] {
        return this.nodes.filter((node) => node.type === type)
    }

    byKind(kind: WikiTreeNodeKind): WikiIndexNode[] {
        return this.nodes.filter((node) => node.kind === kind)
    }

    byId(type: WikiEntityType, id: string): WikiIndexNode | undefined {
        return (
            this.byIdIndex.get(WikiIndex.idKey(type, id)) ??
            this.byIdIndex.get(WikiIndex.idKey(type, WikiPath.bareId(id)))
        )
    }

    childrenOf(path: string): WikiIndexNode[] {
        return this.byParentIndex.get(WikiPath.normalize(path)) ?? []
    }

    descendantsOf(path: string): WikiIndexNode[] {
        const root = WikiPath.normalize(path)
        return this.nodes.filter((node) => WikiPath.contains(root, node.path))
    }

    entities(): WikiIndexNode[] {
        return this.nodes.filter((node) => node.type !== null)
    }

    counts(): Record<string, number> {
        const tally: Record<string, number> = {}
        for (const node of this.nodes) {
            const key = node.type ?? node.kind
            tally[key] = (tally[key] ?? 0) + 1
        }
        return tally
    }

    toJSON(): WikiIndexNode[] {
        return [...this.nodes]
    }

    static fromJSON(nodes: readonly WikiIndexNode[]): WikiIndex {
        return new WikiIndex([...nodes])
    }

    static nodeOf(child: WikiChild, parentPath: string): WikiIndexNode {
        return {
            path: WikiPath.normalize(child.path),
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

    private static idKey(type: WikiEntityType, id: string): string {
        return `${type} ${id}`
    }

    private static buildIdIndex(
        nodes: readonly WikiIndexNode[],
    ): ReadonlyMap<string, WikiIndexNode> {
        const index = new Map<string, WikiIndexNode>()
        for (const node of nodes) {
            if (!node.type || !node.id) continue
            const full = WikiIndex.idKey(node.type, node.id)
            const bare = WikiIndex.idKey(node.type, WikiPath.bareId(node.id))
            if (!index.has(full)) index.set(full, node)
            if (!index.has(bare)) index.set(bare, node)
        }
        return index
    }

    private static buildParentIndex(
        nodes: readonly WikiIndexNode[],
    ): ReadonlyMap<string, WikiIndexNode[]> {
        const index = new Map<string, WikiIndexNode[]>()
        for (const node of nodes) {
            const parent = node.parentPath ?? WikiPath.ROOT
            const bucket = index.get(parent)
            if (bucket) bucket.push(node)
            else index.set(parent, [node])
        }
        return index
    }
}

export interface WikiCrawlOptions {
    root?: string
    maxDepth?: number
    concurrency?: number
    openEntityTypes?: readonly WikiEntityType[]
    onPage?: (path: string, document: WikiDocument) => void
    onError?: (path: string, error: unknown) => void
}

export class WikiCrawler {
    static readonly DEFAULT_OPEN_TYPES: readonly WikiEntityType[] = ["area"]

    private readonly source: WikiDocumentSource

    constructor(source: WikiDocumentSource) {
        this.source = source
    }

    async crawl(options: WikiCrawlOptions = {}): Promise<WikiIndex> {
        const root = WikiPath.normalize(options.root ?? WikiPath.ROOT)
        const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY
        const concurrency = Math.max(1, options.concurrency ?? 8)
        const openTypes = new Set(options.openEntityTypes ?? WikiCrawler.DEFAULT_OPEN_TYPES)

        const collected = new Map<string, WikiIndexNode>()
        const visited = new Set<string>([root])
        const queue: string[] = [root]

        while (queue.length > 0) {
            const batch = queue.splice(0, concurrency)
            const documents = await Promise.all(
                batch.map((path) => this.load(path, options.onError)),
            )
            for (const document of documents) {
                if (!document) continue
                options.onPage?.(WikiPath.normalize(document.path), document)
                for (const child of document.children) {
                    const node = WikiIndex.nodeOf(child, WikiPath.normalize(document.path))
                    collected.set(node.path, node)
                    if (node.depth >= maxDepth) continue
                    if (!WikiCrawler.opens(node, openTypes)) continue
                    if (visited.has(node.path)) continue
                    visited.add(node.path)
                    queue.push(node.path)
                }
            }
        }

        return new WikiIndex([...collected.values()].sort(WikiCrawler.byPath))
    }

    private async load(
        path: string,
        onError: WikiCrawlOptions["onError"],
    ): Promise<WikiDocument | null> {
        try {
            return await this.source.document(path)
        } catch (error) {
            onError?.(path, error)
            return null
        }
    }

    private static opens(node: WikiIndexNode, openTypes: ReadonlySet<WikiEntityType>): boolean {
        if (node.kind === "category") return true
        if (node.kind === "entity" && node.type) return openTypes.has(node.type)
        return false
    }

    private static byPath(left: WikiIndexNode, right: WikiIndexNode): number {
        return left.path.localeCompare(right.path)
    }
}
