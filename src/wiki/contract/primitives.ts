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
] as const

export type WikiEntityType = (typeof WIKI_ENTITY_TYPES)[number]

export const WIKI_TREE_NODE_KINDS = ["category", "entity", "guide"] as const

export type WikiTreeNodeKind = (typeof WIKI_TREE_NODE_KINDS)[number]

export const WIKI_LOCALES = ["en", "es", "fr", "pt", "pt_br"] as const

export type WikiLocaleCode = (typeof WIKI_LOCALES)[number]

export type WikiLocalized = Record<string, string>

export type WikiItemTrait = "tradable" | "investable"

export type WikiShopLimitWindow = "daily" | "weekly" | "alltime"

export type WikiBonusUnit = "ratio" | "seconds" | "flat"

export interface WikiEventWindow {
    eventId: string
    startsAt: string | null
    endsAt: string | null
}

export interface WikiToolPowerParts {
    base: number
    temper: number
    modifier: number
    enchant: number
    total: number
}

export interface WikiToolQualityStep {
    quality: string
    chance: number
    chanceAtMax: number
    modifiers: number
    maxBracket: number
    maxTemper: number
    powerCeiling: number
}

export interface WikiToolTemperFailure {
    resourcesOnly: number
    downgrade: number
    broken: number
}

export interface WikiToolTemperStep {
    level: number
    power: number
    successRate: number
    failure: WikiToolTemperFailure
    flawless: number
    cost: number
}

export interface WikiToolEnchant {
    maxLevel: number
    powerPercent: number
}

export interface WikiToolRepair {
    cost: number
    temperPenalty: number
}

export interface WikiToolProgression {
    stationLevel: number
    stationLevelMax: number
    modifierBrackets: number
    modifierPowerMax: number
    enchant: WikiToolEnchant | null
    qualities: WikiToolQualityStep[]
    temper: WikiToolTemperStep[]
    ceiling: WikiToolPowerParts
    temperGainPercent: number
    safeTemperLevel: number | null
    downgradeFrom: number | null
    breakFrom: number | null
    repair: WikiToolRepair
}

export type WikiPetSkinDoor =
    | { kind: "default" }
    | { kind: "prestige"; prestige: number }
    | { kind: "quest"; chapter: number; window: WikiEventWindow }
    | { kind: "shop"; currencyId: string; price: number; window: WikiEventWindow }
    | { kind: "pass"; tier: number; premium: boolean; window: WikiEventWindow }
    | { kind: "battlepass"; season: string }
    | { kind: "lootbox"; lootboxId: string }
    | { kind: "admin" }

export interface WikiPetPrestigeStep {
    prestige: number
    slots: number
    grantsSlot: boolean
    maxLevel: number
    xpToMaxLevel: number
    xpGainPercent: number
    skinId: string | null
}

export interface WikiPetProgression {
    maxPrestige: number
    draftChoices: number
    steps: WikiPetPrestigeStep[]
    gaugeHours: number
    baseGaugeHours: number
    criticalThreshold: number
    thrivingThreshold: number
    enduranceFloor: number
    spawnWeight: number | null
    spawnWeightByRarity: number[]
}

export interface WikiShopAffinityTier {
    tier: number
    xp: number
    discount: number
    sellBonus: number
    rotationBonus: number
    sellQuota: number
}

export interface WikiShopAffinity {
    buyRate: number
    sellRate: number
    tiers: WikiShopAffinityTier[]
}

export interface WikiRegionMap {
    art: string
    width: number
    height: number
}

export interface WikiConceptCommand {
    id: string
    sub: string | null
}

export interface WikiEventWave {
    id: string
    startsAt: string
    regionIds: string[]
}

export interface WikiEventPass {
    tierCount: number
    currencyId: string
    hasPremiumTrack: boolean
}
