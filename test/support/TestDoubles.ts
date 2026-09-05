import type { Clock } from "../../src/http/HttpCache.js"
import type { FetchLike, Sleeper } from "../../src/http/HttpClient.js"
import type { WikiDocument } from "../../src/wiki/contract/documents.js"

export class FixedClock implements Clock {
    private current: number

    constructor(start = 0) {
        this.current = start
    }

    now(): number {
        return this.current
    }

    advance(ms: number): void {
        this.current += ms
    }
}

export class InstantSleeper implements Sleeper {
    readonly waits: number[] = []

    wait(ms: number): Promise<void> {
        this.waits.push(ms)
        return Promise.resolve()
    }
}

export interface FakeReply {
    status?: number
    body?: unknown
    text?: string
    headers?: Record<string, string>
}

export class FakeFetch {
    readonly calls: string[] = []
    readonly inits: (RequestInit | undefined)[] = []

    private readonly replies = new Map<string, FakeReply[]>()
    private readonly failures = new Map<string, number>()

    static of(replies: Record<string, FakeReply>): FakeFetch {
        const fake = new FakeFetch()
        for (const [url, reply] of Object.entries(replies)) fake.on(url, reply)
        return fake
    }

    on(url: string, ...replies: readonly FakeReply[]): this {
        this.replies.set(url, [...replies])
        return this
    }

    failTimes(url: string, times: number): this {
        this.failures.set(url, times)
        return this
    }

    get handler(): FetchLike {
        return (input: string, init?: RequestInit) => this.answer(input, init)
    }

    countOf(url: string): number {
        return this.calls.filter((call) => call === url).length
    }

    private answer(url: string, init?: RequestInit): Promise<Response> {
        this.calls.push(url)
        this.inits.push(init)
        const remaining = this.failures.get(url) ?? 0
        if (remaining > 0) {
            this.failures.set(url, remaining - 1)
            return Promise.reject(new TypeError("network down"))
        }
        const queue = this.replies.get(url)
        if (!queue || queue.length === 0) {
            return Promise.resolve(
                FakeFetch.responseOf({ status: 404, body: { error: "not_found" } }),
            )
        }
        const reply = queue.length > 1 ? (queue.shift() as FakeReply) : (queue[0] as FakeReply)
        return Promise.resolve(FakeFetch.responseOf(reply))
    }

    private static responseOf(reply: FakeReply): Response {
        const status = reply.status ?? 200
        const body = reply.text ?? (reply.body === undefined ? "" : JSON.stringify(reply.body))
        return new Response(body, {
            status,
            headers: { "content-type": "application/json", ...reply.headers },
        })
    }
}

export class WikiFixtures {
    static readonly ORIGIN = "https://wiki.test"

    static urlOf(path: string): string {
        return path.length > 0
            ? `${WikiFixtures.ORIGIN}/wiki/json/${path}`
            : `${WikiFixtures.ORIGIN}/wiki/json`
    }

    static tree(): Record<string, WikiDocument> {
        return {
            "": WikiFixtures.root(),
            items: WikiFixtures.category("items", "Items", [
                WikiFixtures.child("carrot", "items/carrot", "item", "carrot", "Carrot", "Carotte"),
            ]),
            "items/carrot": WikiFixtures.entity(
                "items/carrot",
                "item",
                "carrot",
                "Carrot",
                "Carotte",
            ),
            areas: WikiFixtures.category("areas", "Areas", [
                WikiFixtures.child(
                    "abyss_trench",
                    "areas/abyss_trench",
                    "area",
                    "area:abyss_trench",
                    "Abyssal Trench",
                    "Fosse abyssale",
                ),
            ]),
            "areas/abyss_trench": WikiFixtures.areaEntity(),
            "areas/abyss_trench/drops": WikiFixtures.category("drops", "Drops", [
                WikiFixtures.child(
                    "gravel",
                    "areas/abyss_trench/drops/dig/gravel",
                    "drop",
                    "drop:abyss_trench:dig:gravel",
                    "Gravel",
                    "Gravier",
                ),
            ]),
            "areas/abyss_trench/drops/dig/gravel": WikiFixtures.entity(
                "areas/abyss_trench/drops/dig/gravel",
                "drop",
                "drop:abyss_trench:dig:gravel",
                "Gravel",
                "Gravier",
            ),
            pets: WikiFixtures.category("pets", "Pets", [
                WikiFixtures.child("cat", "pets/cat", "pet", "pet:cat", "Cat", "Chat"),
            ]),
            "pets/cat": WikiFixtures.entity("pets/cat", "pet", "pet:cat", "Cat", "Chat"),
            "guides/economy": WikiFixtures.guide(),
        }
    }

    static replies(): Record<string, FakeReply> {
        const replies: Record<string, FakeReply> = {}
        for (const [path, document] of Object.entries(WikiFixtures.tree())) {
            replies[WikiFixtures.urlOf(path)] = {
                body: document,
                headers: { "cache-control": "public, max-age=300" },
            }
        }
        return replies
    }

    static fetch(): FakeFetch {
        return FakeFetch.of(WikiFixtures.replies())
    }

    static root(): WikiDocument {
        return {
            version: 7,
            kind: "category",
            path: "",
            name: { en: "Wiki", fr: "Wiki" },
            description: { en: "", fr: "" },
            generatedFrom: "deadbeef",
            counts: {
                item: 1,
                recipe: 0,
                command: 0,
                area: 1,
                drop: 1,
                pet: 1,
                shop: 0,
                npc: 0,
                region: 0,
                concept: 0,
                event: 0,
            },
            children: [
                WikiFixtures.categoryChild("items", "Items"),
                WikiFixtures.categoryChild("areas", "Areas"),
                WikiFixtures.categoryChild("pets", "Pets"),
            ],
        } as unknown as WikiDocument
    }

    private static areaEntity(): WikiDocument {
        return {
            version: 7,
            kind: "area",
            path: "areas/abyss_trench",
            id: "area:abyss_trench",
            canonical: null,
            name: { en: "Abyssal Trench", fr: "Fosse abyssale" },
            description: { en: "", fr: "" },
            data: {},
            relatedDrops: [],
            children: [WikiFixtures.categoryChild("areas/abyss_trench/drops", "Drops")],
        } as unknown as WikiDocument
    }

    private static guide(): WikiDocument {
        return {
            version: 7,
            kind: "guide",
            path: "guides/economy",
            name: { en: "Economy", fr: "Economie" },
            description: { en: "", fr: "" },
            blocks: [{ kind: "text" }],
            children: [],
        } as unknown as WikiDocument
    }

    private static category(path: string, label: string, children: unknown[]): WikiDocument {
        return {
            version: 7,
            kind: "category",
            path,
            name: { en: label, fr: label },
            description: { en: "", fr: "" },
            children,
        } as unknown as WikiDocument
    }

    private static entity(
        path: string,
        kind: string,
        id: string,
        english: string,
        french: string,
    ): WikiDocument {
        return {
            version: 7,
            kind,
            path,
            id,
            canonical: null,
            name: { en: english, fr: french },
            description: { en: `${english} page`, fr: `Page ${french}` },
            data: {},
            relatedDrops: [],
            children: [],
        } as unknown as WikiDocument
    }

    private static child(
        slug: string,
        path: string,
        type: string,
        id: string,
        english: string,
        french: string,
    ): unknown {
        return {
            slug,
            path,
            kind: "entity",
            type,
            id,
            canonical: null,
            name: { en: english, fr: french },
        }
    }

    private static categoryChild(path: string, label: string): unknown {
        return {
            slug: path.split("/").at(-1),
            path,
            kind: "category",
            type: null,
            id: null,
            canonical: null,
            name: { en: label, fr: label },
        }
    }
}
