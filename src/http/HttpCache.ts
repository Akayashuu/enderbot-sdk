export interface Clock {
    now(): number
}

export class SystemClock implements Clock {
    now(): number {
        return Date.now()
    }
}

export interface CacheStore {
    get<T>(key: string): T | undefined
    set<T>(key: string, value: T, ttlMs: number): void
    delete(key: string): void
    clear(): void
}

export class NoCache implements CacheStore {
    get<T>(_key: string): T | undefined {
        return undefined
    }

    set<T>(_key: string, _value: T, _ttlMs: number): void {}

    delete(_key: string): void {}

    clear(): void {}
}

interface CacheEntry {
    value: unknown
    expiresAt: number
}

export class MemoryCache implements CacheStore {
    private readonly entries = new Map<string, CacheEntry>()
    private readonly maxEntries: number
    private readonly clock: Clock

    constructor(maxEntries = 512, clock: Clock = new SystemClock()) {
        this.maxEntries = Math.max(1, maxEntries)
        this.clock = clock
    }

    get<T>(key: string): T | undefined {
        const entry = this.entries.get(key)
        if (!entry) return undefined
        if (entry.expiresAt <= this.clock.now()) {
            this.entries.delete(key)
            return undefined
        }
        this.entries.delete(key)
        this.entries.set(key, entry)
        return entry.value as T
    }

    set<T>(key: string, value: T, ttlMs: number): void {
        if (ttlMs <= 0) return
        this.entries.delete(key)
        this.entries.set(key, { value, expiresAt: this.clock.now() + ttlMs })
        this.evictOverflow()
    }

    delete(key: string): void {
        this.entries.delete(key)
    }

    clear(): void {
        this.entries.clear()
    }

    get size(): number {
        return this.entries.size
    }

    private evictOverflow(): void {
        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next()
            if (oldest.done) return
            this.entries.delete(oldest.value)
        }
    }
}
