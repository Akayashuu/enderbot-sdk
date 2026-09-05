import type { CacheStore } from "../http/HttpCache.js"
import type { FetchLike, RequestOptions, Sleeper } from "../http/HttpClient.js"
import { JsonHttpClient } from "../http/HttpClient.js"
import { HttpStatusError } from "../http/HttpErrors.js"
import type {
    WikiCategoryDocument,
    WikiChild,
    WikiCounts,
    WikiDocument,
    WikiEntityDocument,
    WikiEntityDocumentOf,
    WikiGuideDocument,
    WikiRootDocument,
} from "./contract/documents.js"
import { WikiDocuments } from "./contract/documents.js"
import type { WikiEntityType } from "./contract/primitives.js"
import {
    WikiEntityNotFoundError,
    WikiKindMismatchError,
    WikiPageNotFoundError,
} from "./WikiErrors.js"
import type { WikiCrawlOptions, WikiDocumentSource, WikiIndexNode } from "./WikiIndex.js"
import { WikiCrawler, type WikiIndex } from "./WikiIndex.js"
import { WikiPath } from "./WikiPath.js"
import type { WikiSearchHit, WikiSearchOptions } from "./WikiSearch.js"
import { WikiSearch } from "./WikiSearch.js"
import { WikiText } from "./WikiText.js"

export interface WikiClientOptions {
    baseUrl?: string
    basePath?: string
    locale?: string
    fallbackLocales?: readonly string[]
    timeoutMs?: number
    retries?: number
    retryBackoffMs?: number
    headers?: Record<string, string>
    userAgent?: string
    fetch?: FetchLike
    cache?: CacheStore | false
    defaultTtlMs?: number
    sleeper?: Sleeper
}

export class WikiClient implements WikiDocumentSource {
    static readonly DEFAULT_BASE_URL = "https://ender.gg"
    static readonly DEFAULT_BASE_PATH = "wiki/json"

    private readonly options: WikiClientOptions
    private readonly basePath: string
    private readonly crawler: WikiCrawler
    private readonly localizer: WikiText
    private http: JsonHttpClient
    private pendingIndex: Promise<WikiIndex> | null = null

    constructor(options: WikiClientOptions = {}) {
        this.options = options
        this.basePath = WikiPath.normalize(options.basePath ?? WikiClient.DEFAULT_BASE_PATH)
        this.http = new JsonHttpClient({
            baseUrl: options.baseUrl ?? WikiClient.DEFAULT_BASE_URL,
            timeoutMs: options.timeoutMs,
            retries: options.retries,
            retryBackoffMs: options.retryBackoffMs,
            headers: options.headers,
            userAgent: options.userAgent,
            fetch: options.fetch,
            cache: options.cache,
            defaultTtlMs: options.defaultTtlMs,
            sleeper: options.sleeper,
        })
        this.crawler = new WikiCrawler(this)
        this.localizer = new WikiText(
            options.locale ?? WikiText.DEFAULT_LOCALE,
            options.fallbackLocales ?? [],
        )
    }

    withLocale(locale: string, fallbackLocales?: readonly string[]): WikiClient {
        const clone = new WikiClient({
            ...this.options,
            locale,
            ...(fallbackLocales ? { fallbackLocales } : {}),
        })
        clone.http = this.http
        clone.pendingIndex = this.pendingIndex
        return clone
    }

    get text(): WikiText {
        return this.localizer
    }

    get baseUrl(): string {
        return this.http.origin
    }

    urlOf(path: string): string {
        return `${this.http.origin}/${WikiPath.join(this.basePath, path)}`
    }

    async document(path: string, options: RequestOptions = {}): Promise<WikiDocument> {
        const normalized = WikiPath.normalize(path)
        try {
            return await this.http.get<WikiDocument>(
                WikiPath.join(this.basePath, normalized),
                options,
            )
        } catch (error) {
            throw WikiClient.translate(error, normalized)
        }
    }

    async tryDocument(path: string, options?: RequestOptions): Promise<WikiDocument | null> {
        try {
            return await this.document(path, options)
        } catch (error) {
            if (error instanceof WikiPageNotFoundError) return null
            throw error
        }
    }

    async exists(path: string, options?: RequestOptions): Promise<boolean> {
        return (await this.tryDocument(path, options)) !== null
    }

    async root(options?: RequestOptions): Promise<WikiRootDocument> {
        const document = await this.document(WikiPath.ROOT, options)
        if (!WikiDocuments.isRoot(document)) {
            throw WikiKindMismatchError.from(document, "root")
        }
        return document
    }

    async counts(options?: RequestOptions): Promise<WikiCounts> {
        return (await this.root(options)).counts
    }

    async generatedFrom(options?: RequestOptions): Promise<string> {
        return (await this.root(options)).generatedFrom
    }

    async category(path: string, options?: RequestOptions): Promise<WikiCategoryDocument> {
        const document = await this.document(path, options)
        if (!WikiDocuments.isCategory(document)) {
            throw WikiKindMismatchError.from(document, "category")
        }
        return document
    }

    async guide(path: string, options?: RequestOptions): Promise<WikiGuideDocument> {
        const document = await this.document(path, options)
        if (!WikiDocuments.isGuide(document)) {
            throw WikiKindMismatchError.from(document, "guide")
        }
        return document
    }

    async entity(path: string, options?: RequestOptions): Promise<WikiEntityDocument> {
        const document = await this.document(path, options)
        if (!WikiDocuments.isEntity(document)) {
            throw WikiKindMismatchError.from(document, "entity")
        }
        return document
    }

    async entityOfKind<K extends WikiEntityType>(
        kind: K,
        path: string,
        options?: RequestOptions,
    ): Promise<WikiEntityDocumentOf<K>> {
        const document = await this.document(path, options)
        if (!WikiDocuments.isOfKind(document, kind)) {
            throw WikiKindMismatchError.from(document, kind)
        }
        return document
    }

    async children(path: string, options?: RequestOptions): Promise<WikiChild[]> {
        return (await this.document(path, options)).children
    }

    async find<K extends WikiEntityType>(
        kind: K,
        id: string,
        options?: RequestOptions,
    ): Promise<WikiEntityDocumentOf<K>> {
        const path = await this.resolve(kind, id, options)
        if (!path) throw new WikiEntityNotFoundError(kind, id)
        return this.entityOfKind(kind, path, options)
    }

    async tryFind<K extends WikiEntityType>(
        kind: K,
        id: string,
        options?: RequestOptions,
    ): Promise<WikiEntityDocumentOf<K> | null> {
        try {
            return await this.find(kind, id, options)
        } catch (error) {
            if (error instanceof WikiEntityNotFoundError) return null
            if (error instanceof WikiPageNotFoundError) return null
            throw error
        }
    }

    async resolve(
        kind: WikiEntityType,
        id: string,
        options?: RequestOptions,
    ): Promise<string | null> {
        for (const guess of WikiPath.guesses(kind, id)) {
            const document = await this.tryDocument(guess, options)
            if (document && WikiDocuments.isOfKind(document, kind)) return document.path
        }
        return (await this.index()).byId(kind, id)?.path ?? null
    }

    item(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"item">> {
        return this.find("item", id, options)
    }

    recipe(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"recipe">> {
        return this.find("recipe", id, options)
    }

    command(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"command">> {
        return this.find("command", id, options)
    }

    area(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"area">> {
        return this.find("area", id, options)
    }

    drop(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"drop">> {
        return this.find("drop", id, options)
    }

    pet(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"pet">> {
        return this.find("pet", id, options)
    }

    shop(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"shop">> {
        return this.find("shop", id, options)
    }

    npc(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"npc">> {
        return this.find("npc", id, options)
    }

    region(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"region">> {
        return this.find("region", id, options)
    }

    concept(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"concept">> {
        return this.find("concept", id, options)
    }

    event(id: string, options?: RequestOptions): Promise<WikiEntityDocumentOf<"event">> {
        return this.find("event", id, options)
    }

    index(options?: WikiCrawlOptions): Promise<WikiIndex> {
        if (options) return this.crawler.crawl(options)
        this.pendingIndex ??= this.crawler.crawl().catch((error: unknown) => {
            this.pendingIndex = null
            throw error
        })
        return this.pendingIndex
    }

    async refreshIndex(options?: WikiCrawlOptions): Promise<WikiIndex> {
        this.pendingIndex = null
        this.http.clearCache()
        const index = await this.index(options)
        if (options) this.pendingIndex = Promise.resolve(index)
        return index
    }

    useIndex(index: WikiIndex): void {
        this.pendingIndex = Promise.resolve(index)
    }

    async list(kind: WikiEntityType): Promise<WikiIndexNode[]> {
        return (await this.index()).byType(kind)
    }

    async search(query: string, options?: WikiSearchOptions): Promise<WikiSearchHit[]> {
        return new WikiSearch(await this.index()).run(query, options)
    }

    async walk(
        path: string = WikiPath.ROOT,
        options?: Omit<WikiCrawlOptions, "root">,
    ): Promise<WikiIndex> {
        return this.crawler.crawl({ ...options, root: path })
    }

    clearCache(): void {
        this.http.clearCache()
        this.pendingIndex = null
    }

    private static translate(error: unknown, path: string): unknown {
        if (error instanceof HttpStatusError && error.status === 404) {
            return new WikiPageNotFoundError(path)
        }
        return error
    }
}
