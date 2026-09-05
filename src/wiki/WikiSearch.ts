import type { WikiEntityType, WikiTreeNodeKind } from "./contract/primitives.js"
import type { WikiIndex, WikiIndexNode } from "./WikiIndex.js"
import { WikiPath } from "./WikiPath.js"

export interface WikiSearchOptions {
    limit?: number
    minScore?: number
    types?: readonly WikiEntityType[]
    kinds?: readonly WikiTreeNodeKind[]
    under?: string
}

export interface WikiSearchHit {
    node: WikiIndexNode
    score: number
    matched: string
}

export class SearchText {
    private static readonly DIACRITICS = /\p{Diacritic}/gu
    private static readonly SEPARATORS = /[\s_\-/:]+/g

    static normalize(value: string): string {
        return value
            .normalize("NFD")
            .replace(SearchText.DIACRITICS, "")
            .toLowerCase()
            .replace(SearchText.SEPARATORS, " ")
            .trim()
    }

    static tokens(value: string): string[] {
        const normalized = SearchText.normalize(value)
        return normalized.length > 0 ? normalized.split(" ") : []
    }
}

class WikiSearchScorer {
    private static readonly EXACT = 100
    private static readonly PREFIX = 80
    private static readonly WORD_PREFIX = 70
    private static readonly SUBSTRING = 55
    private static readonly ALL_TOKENS = 40

    static score(candidate: string, query: string, queryTokens: readonly string[]): number {
        const haystack = SearchText.normalize(candidate)
        if (haystack.length === 0) return 0
        if (haystack === query) return WikiSearchScorer.EXACT
        if (haystack.startsWith(query)) {
            return WikiSearchScorer.PREFIX + WikiSearchScorer.brevity(haystack, query)
        }
        if (WikiSearchScorer.hasWordPrefix(haystack, query)) {
            return WikiSearchScorer.WORD_PREFIX + WikiSearchScorer.brevity(haystack, query)
        }
        if (haystack.includes(query)) {
            return WikiSearchScorer.SUBSTRING + WikiSearchScorer.brevity(haystack, query)
        }
        if (WikiSearchScorer.holdsEvery(haystack, queryTokens)) {
            return WikiSearchScorer.ALL_TOKENS + WikiSearchScorer.brevity(haystack, query)
        }
        return 0
    }

    private static hasWordPrefix(haystack: string, query: string): boolean {
        return haystack.split(" ").some((word) => word.startsWith(query))
    }

    private static holdsEvery(haystack: string, queryTokens: readonly string[]): boolean {
        return queryTokens.length > 0 && queryTokens.every((token) => haystack.includes(token))
    }

    private static brevity(haystack: string, query: string): number {
        return Math.round((query.length / haystack.length) * 10)
    }
}

export class WikiSearch {
    private static readonly DEFAULT_LIMIT = 20

    private readonly index: WikiIndex

    constructor(index: WikiIndex) {
        this.index = index
    }

    run(query: string, options: WikiSearchOptions = {}): WikiSearchHit[] {
        const needle = SearchText.normalize(query)
        if (needle.length === 0) return []
        const tokens = SearchText.tokens(query)
        const minScore = options.minScore ?? 1
        const limit = options.limit ?? WikiSearch.DEFAULT_LIMIT

        const hits: WikiSearchHit[] = []
        for (const node of this.index.all()) {
            if (!this.accepts(node, options)) continue
            const hit = WikiSearch.best(node, needle, tokens)
            if (hit && hit.score >= minScore) hits.push(hit)
        }
        return hits.sort(WikiSearch.byScore).slice(0, limit)
    }

    private accepts(node: WikiIndexNode, options: WikiSearchOptions): boolean {
        if (options.types && (!node.type || !options.types.includes(node.type))) return false
        if (options.kinds && !options.kinds.includes(node.kind)) return false
        if (options.under && !WikiPath.contains(options.under, node.path)) return false
        return true
    }

    private static best(
        node: WikiIndexNode,
        needle: string,
        tokens: readonly string[],
    ): WikiSearchHit | null {
        let score = 0
        let matched = ""
        for (const candidate of WikiSearch.candidates(node)) {
            const value = WikiSearchScorer.score(candidate, needle, tokens)
            if (value > score) {
                score = value
                matched = candidate
            }
        }
        return score > 0 ? { node, score, matched } : null
    }

    private static candidates(node: WikiIndexNode): string[] {
        const names = node.name ? Object.values(node.name) : []
        const identifiers = [node.slug, node.path]
        if (node.id) identifiers.push(WikiPath.bareId(node.id), node.id)
        return [...names, ...identifiers]
    }

    private static byScore(left: WikiSearchHit, right: WikiSearchHit): number {
        if (right.score !== left.score) return right.score - left.score
        return left.node.path.localeCompare(right.node.path)
    }
}
