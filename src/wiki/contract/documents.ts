import type { WikiDataMap, WikiGuideBlock, WikiRelatedDrop } from "./data.js"
import type { WikiEntityType, WikiLocalized, WikiTreeNodeKind } from "./primitives.js"

export interface WikiChild {
    slug: string
    path: string
    kind: WikiTreeNodeKind
    type: WikiEntityType | null
    id: string | null
    canonical: string | null
    name: WikiLocalized | null
}

export interface WikiDocumentBase {
    version: number
    path: string
    name: WikiLocalized | null
    description: WikiLocalized | null
    children: WikiChild[]
}

export interface WikiEntityDocumentShape<K extends WikiEntityType> extends WikiDocumentBase {
    kind: K
    id: string
    canonical: string | null
    data: WikiDataMap[K]
    relatedDrops: WikiRelatedDrop[]
}

export type WikiEntityDocument = {
    [K in WikiEntityType]: WikiEntityDocumentShape<K>
}[WikiEntityType]

export type WikiEntityDocumentOf<K extends WikiEntityType> = WikiDocument &
    WikiEntityDocumentShape<K>

export interface WikiCategoryDocument extends WikiDocumentBase {
    kind: "category"
}

export type WikiCounts = Record<WikiEntityType, number>

export interface WikiRootDocument extends WikiCategoryDocument {
    generatedFrom: string
    counts: WikiCounts
}

export interface WikiGuideDocument extends WikiDocumentBase {
    kind: "guide"
    blocks: WikiGuideBlock[]
}

export type WikiDocument =
    | WikiEntityDocument
    | WikiCategoryDocument
    | WikiRootDocument
    | WikiGuideDocument

export interface WikiNotFoundBody {
    error: "not_found"
    path: string
}

export class WikiDocuments {
    static isEntity(document: WikiDocument): document is WikiEntityDocument {
        return document.kind !== "category" && document.kind !== "guide"
    }

    static isCategory(document: WikiDocument): document is WikiCategoryDocument {
        return document.kind === "category"
    }

    static isRoot(document: WikiDocument): document is WikiRootDocument {
        return WikiDocuments.isCategory(document) && "counts" in document
    }

    static isGuide(document: WikiDocument): document is WikiGuideDocument {
        return document.kind === "guide"
    }

    static isOfKind<K extends WikiEntityType>(
        document: WikiDocument,
        kind: K,
    ): document is WikiEntityDocumentOf<K> {
        return document.kind === kind
    }

    static isNotFoundBody(body: unknown): body is WikiNotFoundBody {
        if (typeof body !== "object" || body === null) return false
        return (body as { error?: unknown }).error === "not_found"
    }
}
