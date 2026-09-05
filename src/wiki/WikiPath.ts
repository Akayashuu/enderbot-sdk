import type { WikiEntityType } from "./contract/primitives.js"

export class WikiPath {
    static readonly ROOT = ""

    private static readonly SECTIONS: Record<WikiEntityType, string | null> = {
        item: "items",
        recipe: "recipes",
        command: "commands",
        area: "areas",
        drop: null,
        pet: "pets",
        shop: "shops",
        npc: "npcs",
        region: "regions",
        concept: null,
        event: "events",
    }

    static normalize(path: string): string {
        return path
            .trim()
            .replace(/^\/+|\/+$/g, "")
            .replace(/\/{2,}/g, "/")
    }

    static isRoot(path: string): boolean {
        return WikiPath.normalize(path) === WikiPath.ROOT
    }

    static segments(path: string): string[] {
        const normalized = WikiPath.normalize(path)
        return normalized.length > 0 ? normalized.split("/") : []
    }

    static join(...parts: readonly string[]): string {
        return WikiPath.normalize(parts.join("/"))
    }

    static parent(path: string): string | null {
        const segments = WikiPath.segments(path)
        if (segments.length === 0) return null
        return segments.slice(0, -1).join("/")
    }

    static slug(path: string): string {
        return WikiPath.segments(path).at(-1) ?? WikiPath.ROOT
    }

    static ancestors(path: string): string[] {
        const segments = WikiPath.segments(path)
        return segments.map((_, position) => segments.slice(0, position).join("/"))
    }

    static contains(ancestor: string, path: string): boolean {
        const parent = WikiPath.normalize(ancestor)
        const child = WikiPath.normalize(path)
        if (parent === WikiPath.ROOT) return child !== WikiPath.ROOT
        return child.startsWith(`${parent}/`)
    }

    static sectionOf(type: WikiEntityType): string | null {
        return WikiPath.SECTIONS[type]
    }

    static bareId(id: string): string {
        const colon = id.lastIndexOf(":")
        return colon === -1 ? id : id.slice(colon + 1)
    }

    static guesses(type: WikiEntityType, id: string): string[] {
        const parts = id.split(":")
        const tail = parts[0] === type ? parts.slice(1) : parts
        if (type === "recipe" && tail.length >= 2) return [`recipes/${tail.join("/")}`]
        if (type === "drop" && tail.length === 3) {
            return [`areas/${tail[0]}/drops/${tail[1]}/${tail[2]}`]
        }
        const section = WikiPath.sectionOf(type)
        if (!section) return []
        return [`${section}/${tail.join("_")}`]
    }
}
