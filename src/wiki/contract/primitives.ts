export const WIKI_ENTITY_TYPES = [
    "item",
    "recipe",
    "command",
    "area",
    "drop",
    "pet",
    "shop",
    "npc",
    "region",
    "concept",
    "event",
    "badge",
    "title",
    "enchant",
    "station",
    "encounter",
] as const

export type WikiEntityType = (typeof WIKI_ENTITY_TYPES)[number]

export const WIKI_TREE_NODE_KINDS = ["category", "entity", "guide"] as const

export type WikiTreeNodeKind = (typeof WIKI_TREE_NODE_KINDS)[number]

export const WIKI_LOCALES = ["en", "es", "fr", "pt", "pt_br"] as const

export type WikiLocaleCode = (typeof WIKI_LOCALES)[number]

export type WikiLocalized = Record<string, string>
