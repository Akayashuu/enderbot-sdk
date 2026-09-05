import type {
    WikiBonusUnit,
    WikiConceptCommand,
    WikiEntityType,
    WikiEventPass,
    WikiEventWave,
    WikiEventWindow,
    WikiItemTrait,
    WikiLocalized,
    WikiPetProgression,
    WikiPetSkinDoor,
    WikiRegionMap,
    WikiShopAffinity,
    WikiShopLimitWindow,
    WikiToolProgression,
} from "./primitives.js"

export interface WikiShopLimit {
    window: WikiShopLimitWindow
    steps: number[]
}

export interface WikiItemSource {
    areaId: string
    activityKind: string
}

export interface WikiItemOffer {
    shopId: string
    price: number
    limit: WikiShopLimit | null
    requiredAffinity: number | null
}

export interface WikiToolStats {
    power: number
    tier: number
    recipeTier: number
    craftingTableLevelRequired: number
    furnaceLevelRequired: number
    jewelerLevelRequired: number
}

export interface WikiItemData {
    kind: "resource" | "tool"
    category: string
    traits: WikiItemTrait[]
    netWorth: string
    craftedBy: string[]
    usedIn: string[]
    foundIn: WikiItemSource[]
    soldBy: WikiItemOffer[]
    stats: WikiToolStats | null
    progression: WikiToolProgression | null
    unlocks: string[]
}

export interface WikiRecipeIO {
    item: string
    amount: number
}

export interface WikiRecipeData {
    station: string
    category: string | null
    recipeTier: number
    stationLevelRequired: number
    craftingTimeMinutes: number
    xpReward: number
    inputs: WikiRecipeIO[]
    outputs: WikiRecipeIO[]
}

export interface WikiCommandOption {
    name: string
    description: WikiLocalized | null
    required: boolean
}

export interface WikiCommandSubcommand {
    name: string
    description: WikiLocalized | null
    options: WikiCommandOption[]
}

export interface WikiCommandData {
    emoji: string | null
    module: string
    categories: string[]
    isSlash: boolean
    isPrefix: boolean
    aliases: string[]
    isGuildOnly: boolean
    requiresAccount: boolean
    triggersCaptcha: boolean
    options: WikiCommandOption[]
    subcommands: WikiCommandSubcommand[]
}

export interface WikiMapAnchor {
    x: number
    y: number
}

export interface WikiAreaData {
    emoji: string | null
    regionId: string
    ownerEventId: string | null
    isEventScoped: boolean
    connections: string[]
    residents: string[]
    shopId: string | null
    altarId: string | null
    activities: string[]
    anchor: WikiMapAnchor | null
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

export interface WikiPetBonus {
    type: string
    group: string
    maxRatio: number
    unit: WikiBonusUnit
    signature: boolean
    capAtMaxPrestige: number
    absoluteCap: number | null
}

export interface WikiPetSkin {
    id: string
    name: WikiLocalized | null
    source: string
    prestige: number | null
    emoji: string | null
    hasFemaleArt: boolean
    door: WikiPetSkinDoor
}

export interface WikiPetHabitat {
    areaId: string
    minLevel: number
    maxLevel: number
}

export interface WikiPetData {
    emoji: string | null
    rarity: number
    foodId: string
    food: WikiLocalized | null
    needsDecayMultiplier: number
    bonusPool: WikiPetBonus[]
    innateBonus: WikiPetBonus | null
    skins: WikiPetSkin[]
    habitats: WikiPetHabitat[]
    animationStates: string[]
    progression: WikiPetProgression
}

export interface WikiShopOffer {
    itemId: string
    name: WikiLocalized | null
    category: string
    price: number
    limit: WikiShopLimit | null
    requiredAffinity: number | null
    rotation: number | null
    quality: string | null
}

export interface WikiShopData {
    npcId: string
    currencyId: string
    areaId: string | null
    buybackCategories: string[]
    affinity: WikiShopAffinity | null
    backdrop: string | null
    offers: WikiShopOffer[]
}

export interface WikiNpcQuest {
    id: string
    name: WikiLocalized | null
    type: string
    nextQuestId: string | null
}

export interface WikiNpcData {
    homeAreaId: string | null
    areaIds: string[]
    shopIds: string[]
    quests: WikiNpcQuest[]
}

export interface WikiRegionData {
    ownerEventId: string | null
    isEventScoped: boolean
    allowsTeleport: boolean
    areaIds: string[]
    map: WikiRegionMap | null
    window: WikiEventWindow | null
}

export interface WikiEventReward {
    type: string
    amount: number
    resourceId?: string
    badgeId?: string
    titleId?: string
    petSpecies?: string
    skinSpecies?: string
    skinId?: string
}

export interface WikiEventChapter {
    id: string
    name: WikiLocalized | null
    summary: WikiLocalized | null
    unlockWeek: number
    waveId: string | null
    objectiveCount: number
    rewards: WikiEventReward[]
}

export interface WikiEventBadge {
    id: string
    name: WikiLocalized | null
    description: WikiLocalized | null
    rarity: string
    art: string
}

export interface WikiEventTitle {
    id: string
    name: WikiLocalized | null
    rarity: string
}

export interface WikiEventTop {
    id: string
    name: WikiLocalized | null
}

export interface WikiEventHook {
    key: string
    emoji: string
    name: WikiLocalized | null
}

export interface WikiEventSurvivors {
    badges: WikiEventBadge[]
    titles: WikiEventTitle[]
    petIds: string[]
    tops: WikiEventTop[]
}

export interface WikiEventData {
    emoji: string | null
    art: string
    startsAt: string | null
    endsAt: string | null
    waves: WikiEventWave[]
    regionIds: string[]
    shopIds: string[]
    currencyIds: string[]
    purgedCurrencyIds: string[]
    chapters: WikiEventChapter[]
    pass: WikiEventPass | null
    hooks: WikiEventHook[]
    survivors: WikiEventSurvivors
}

export type WikiProse = { [field: string]: unknown }

export interface WikiConceptIntro extends WikiProse {
    lead: WikiLocalized | null
}

export interface WikiConceptPanel extends WikiProse {
    kind: string
}

export interface WikiConceptData {
    art: string
    familyPath: string
    intro: WikiConceptIntro
    flow: WikiProse | null
    tables: WikiProse[]
    racks: WikiProse[]
    panels: WikiConceptPanel[]
    outlets: WikiProse | null
    neighbours: WikiProse | null
    commands: WikiConceptCommand[]
}

export interface WikiGuideBlock extends WikiProse {
    kind: string
}

export type WikiDataMap = {
    item: WikiItemData
    recipe: WikiRecipeData
    command: WikiCommandData
    area: WikiAreaData
    drop: WikiDropData
    pet: WikiPetData
    shop: WikiShopData
    npc: WikiNpcData
    region: WikiRegionData
    concept: WikiConceptData
    event: WikiEventData
}

export type WikiData = WikiDataMap[WikiEntityType]
