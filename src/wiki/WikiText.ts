import type { WikiLocalized } from "./contract/primitives.js"

export class WikiText {
    static readonly DEFAULT_LOCALE = "en"
    private static readonly REGIONAL = /_[a-z]+$/

    private readonly chain: readonly string[]

    constructor(locale: string = WikiText.DEFAULT_LOCALE, fallbacks: readonly string[] = []) {
        this.chain = WikiText.chainOf(locale, fallbacks)
    }

    get locale(): string {
        return this.chain[0] ?? WikiText.DEFAULT_LOCALE
    }

    get locales(): readonly string[] {
        return this.chain
    }

    of(value: WikiLocalized | null | undefined): string | null {
        if (!value) return null
        for (const locale of this.chain) {
            const text = value[locale]
            if (text) return text
        }
        for (const text of Object.values(value)) {
            if (text) return text
        }
        return null
    }

    or(value: WikiLocalized | null | undefined, fallback: string): string {
        return this.of(value) ?? fallback
    }

    orEmpty(value: WikiLocalized | null | undefined): string {
        return this.of(value) ?? ""
    }

    all(value: WikiLocalized | null | undefined): string[] {
        return value ? Object.values(value).filter((text) => text.length > 0) : []
    }

    withLocale(locale: string): WikiText {
        return new WikiText(locale, this.chain.slice(1))
    }

    private static chainOf(locale: string, fallbacks: readonly string[]): readonly string[] {
        const candidates = [
            locale,
            ...WikiText.broaden(locale),
            ...fallbacks,
            WikiText.DEFAULT_LOCALE,
        ]
        return [...new Set(candidates.filter((entry) => entry.length > 0))]
    }

    private static broaden(locale: string): string[] {
        const base = locale.replace(WikiText.REGIONAL, "")
        return base === locale ? [] : [base]
    }
}
