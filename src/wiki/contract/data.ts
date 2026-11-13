import type { WikiLocalized } from "./primitives.js"

export const WIKI_DOCUMENT_KINDS = [
    "badge",
    "title",
    "enchant",
    "shop",
    "pet",
    "npc",
    "item",
    "area",
    "concept",
    "fiche",
    "guideFamily",
    "firstSteps",
    "systemBoard",
    "dungeon",
    "dungeonIndex",
] as const

export type WikiDocumentKind = (typeof WIKI_DOCUMENT_KINDS)[number]

export type WikiDocumentBody = {
    [K in WikiDocumentKind]: { kind: K; view: unknown }
}[WikiDocumentKind]

export type WikiProse = { [field: string]: unknown }

export interface WikiGuideBlock extends WikiProse {
    kind: string
}

export interface WikiDropData {
    areaId: string
    activityKind: string
    resourceId: string
}

export interface WikiRelatedDrop extends WikiDropData {
    id: string
    path: string
    name: WikiLocalized | null
}
