import { EnderbotSdkError } from "../http/HttpErrors.js"
import type { WikiDocument } from "./contract/documents.js"
import type { WikiEntityType } from "./contract/primitives.js"

export class WikiPageNotFoundError extends EnderbotSdkError {
    readonly path: string

    constructor(path: string) {
        super(`No wiki page at "${path}"`)
        this.path = path
    }
}

export class WikiKindMismatchError extends EnderbotSdkError {
    readonly path: string
    readonly expected: string
    readonly actual: string

    constructor(path: string, expected: string, actual: string) {
        super(`Wiki page "${path}" is a ${actual} page, expected a ${expected} page`)
        this.path = path
        this.expected = expected
        this.actual = actual
    }

    static from(document: WikiDocument, expected: string): WikiKindMismatchError {
        return new WikiKindMismatchError(document.path, expected, document.kind)
    }
}

export class WikiEntityNotFoundError extends EnderbotSdkError {
    readonly type: WikiEntityType
    readonly id: string

    constructor(type: WikiEntityType, id: string) {
        super(`No ${type} named "${id}" in the wiki tree`)
        this.type = type
        this.id = id
    }
}
