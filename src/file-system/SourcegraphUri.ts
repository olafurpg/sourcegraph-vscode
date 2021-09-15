import { URL, URLSearchParams } from 'url'
import { Position, Range } from '../queries/Range'

export class SourcegraphUri {
    private constructor(
        public readonly uri: string,
        public readonly url: URL,
        public readonly repository: string,
        public revision: string | undefined,
        public path: string | undefined,
        public readonly rawRevision: string | undefined,
        public readonly commitRange: string | undefined,
        public readonly commitID: string | undefined,
        public readonly position: Position | undefined,
        public readonly range: Range | undefined
    ) {}
    public static parse(uri: string): SourcegraphUri {
        uri = uri.replace('https://', 'sourcegraph://')
        const url = new URL(uri.replace('sourcegraph://', 'https://'))
        let pathname = url.pathname.slice(1) // trim leading '/'
        if (pathname.endsWith('/')) {
            pathname = pathname.slice(0, -1) // trim trailing '/'
        }

        const indexOfSeparator = pathname.indexOf('/-/')

        // examples:
        // - 'github.com/gorilla/mux'
        // - 'github.com/gorilla/mux@revision'
        // - 'foo/bar' (from 'sourcegraph.mycompany.com/foo/bar')
        // - 'foo/bar@revision' (from 'sourcegraph.mycompany.com/foo/bar@revision')
        // - 'foobar' (from 'sourcegraph.mycompany.com/foobar')
        // - 'foobar@revision' (from 'sourcegraph.mycompany.com/foobar@revision')
        let repoRevision: string
        if (indexOfSeparator === -1) {
            repoRevision = pathname // the whole string
        } else {
            repoRevision = pathname.slice(0, indexOfSeparator) // the whole string leading up to the separator (allows revision to be multiple path parts)
        }
        const { repository, revision, rawRevision } = parseRepoRevision(repoRevision)
        const commitID = revision && /^[\da-f]{40}$/i.test(revision) ? revision : undefined

        let path: string | undefined
        let commitRange: string | undefined
        const treeSeparator = pathname.indexOf('/-/tree/')
        const blobSeparator = pathname.indexOf('/-/blob/')
        const comparisonSeparator = pathname.indexOf('/-/compare/')
        if (treeSeparator !== -1) {
            path = decodeURIComponent(pathname.slice(treeSeparator + '/-/tree/'.length))
        }
        if (blobSeparator !== -1) {
            path = decodeURIComponent(pathname.slice(blobSeparator + '/-/blob/'.length))
        }
        if (comparisonSeparator !== -1) {
            commitRange = pathname.slice(comparisonSeparator + '/-/compare/'.length)
        }
        let position: Position | undefined
        let range: Range | undefined

        const parsedHash = parseQueryAndHash(url.search, url.hash)
        if (parsedHash.line) {
            position = {
                line: parsedHash.line,
                character: parsedHash.character || 0,
            }
            if (parsedHash.endLine) {
                range = {
                    start: position,
                    end: {
                        line: parsedHash.endLine,
                        character: parsedHash.endCharacter || 0,
                    },
                }
            }
        }
        return new SourcegraphUri(
            uri,
            url,
            repository,
            revision,
            path,
            rawRevision,
            commitRange,
            commitID,
            position,
            range
        )
    }
    public repositoryString(): string {
        return `sourcegraph://${this.url.host}/${this.repository}${this.revisionString()}`
    }
    public revisionString(): string {
        return this.revision ? `@${this.revision}` : ''
    }
    public parent(): string | undefined {
        if (typeof this.path === 'string') {
            const slash = this.uri.lastIndexOf('/')
            if (slash < 0 || !this.path.includes('/')) {
                const revision = this.revision ? `@${this.revision}` : ''
                return `sourcegraph://${this.url.host}/${this.repository}${revision}`
            }
            const parent = this.uri.slice(0, slash).replace('/-/blob/', '/-/tree/')
            return parent
        }
        return undefined
    }
}

// NOTE: The code below is copy-pasted from the sourcegraph/sourcegraph repository
// https://sourcegraph.com/github.com/sourcegraph/sourcegraph@56dfaaa3e3172f9afd4a29a4780a7f1a34198238/-/blob/client/shared/src/util/url.ts?L287

/**
 * Represents a line, a position, a line range, or a position range. It forbids
 * just a character, or a range from a line to a position or vice versa (such as
 * "L1-2:3" or "L1:2-3"), none of which would make much sense.
 *
 * 1-indexed.
 */
type LineOrPositionOrRange =
    | { line?: undefined; character?: undefined; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: number; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: undefined; endLine?: number; endCharacter?: undefined }
    | { line: number; character: number; endLine: number; endCharacter: number }

/**
 * Parses the URL search (query) portion and looks for a parameter which matches a line, position, or range in the file. If not found, it
 * falls back to parsing the hash for backwards compatibility.
 *
 * @template V The type that describes the view state (typically a union of string constants). There is no runtime check that the return value satisfies V.
 */
function parseQueryAndHash<V extends string>(query: string, hash: string): LineOrPositionOrRange & { viewState?: V } {
    const lpr = findLineInSearchParameters(new URLSearchParams(query))
    const parsedHash = parseHash<V>(hash)
    if (!lpr) {
        return parsedHash
    }
    return { ...lpr, viewState: parsedHash.viewState }
}

/**
 * Parses the URL fragment (hash) portion, which consists of a line, position, or range in the file, plus an
 * optional "viewState" parameter (that encodes other view state, such as for the panel).
 *
 * For example, in the URL fragment "#L17:19-21:23$foo:bar", the "viewState" is "foo:bar".
 *
 * @template V The type that describes the view state (typically a union of string constants). There is no runtime check that the return value satisfies V.
 */
function parseHash<V extends string>(hash: string): LineOrPositionOrRange & { viewState?: V } {
    if (hash.startsWith('#')) {
        hash = hash.slice('#'.length)
    }

    if (!isLegacyFragment(hash)) {
        // Modern hash parsing logic (e.g. for hashes like `"#L17:19-21:23&tab=foo:bar"`:
        const searchParameters = new URLSearchParams(hash)
        const lpr = (findLineInSearchParameters(searchParameters) || {}) as LineOrPositionOrRange & {
            viewState?: V
        }
        if (searchParameters.get('tab')) {
            lpr.viewState = searchParameters.get('tab') as V
        }
        return lpr
    }

    // Legacy hash parsing logic (e.g. for hashes like "#L17:19-21:23$foo:bar" where the "viewState" is "foo:bar"):
    if (!/^(L\d+(:\d+)?(-\d+(:\d+)?)?)?(\$.*)?$/.test(hash)) {
        // invalid or empty hash
        return {}
    }
    const lineCharModalInfo = hash.split('$', 2) // e.g. "L17:19-21:23$references"
    const lpr = parseLineOrPositionOrRange(lineCharModalInfo[0]) as LineOrPositionOrRange & { viewState?: V }
    if (lineCharModalInfo[1]) {
        lpr.viewState = lineCharModalInfo[1] as V
    }
    return lpr
}

/**
 * Tells if the given fragment component is a legacy blob hash component or not.
 *
 * @param hash The URL fragment.
 */
function isLegacyFragment(hash: string): boolean {
    if (hash.startsWith('#')) {
        hash = hash.slice('#'.length)
    }
    return (
        hash !== '' &&
        !hash.includes('=') &&
        (hash.includes('$info') ||
            hash.includes('$def') ||
            hash.includes('$references') ||
            hash.includes('$impl') ||
            hash.includes('$history'))
    )
}

/**
 * Finds the URL search parameter which has a key like "L1-2:3" without any
 * value.
 *
 * @param searchParameters The URLSearchParams to look for the line in.
 */
function findLineInSearchParameters(searchParameters: URLSearchParams): LineOrPositionOrRange | undefined {
    const key = findLineKeyInSearchParameters(searchParameters)
    return key ? parseLineOrPositionOrRange(key) : undefined
}

/**
 * Parses a string like "L1-2:3", a range from a line to a position.
 */
function parseLineOrPositionOrRange(lineChar: string): LineOrPositionOrRange {
    if (!/^(L\d+(:\d+)?(-L?\d+(:\d+)?)?)?$/.test(lineChar)) {
        return {} // invalid
    }

    // Parse the line or position range, ensuring we don't get an inconsistent result
    // (such as L1-2:3, a range from a line to a position).
    let line: number | undefined // 17
    let character: number | undefined // 19
    let endLine: number | undefined // 21
    let endCharacter: number | undefined // 23
    if (lineChar.startsWith('L')) {
        const positionOrRangeString = lineChar.slice(1)
        const [startString, endString] = positionOrRangeString.split('-', 2)
        if (startString) {
            const parsed = parseLineOrPosition(startString)
            line = parsed.line
            character = parsed.character
        }
        if (endString) {
            const parsed = parseLineOrPosition(endString)
            endLine = parsed.line
            endCharacter = parsed.character
        }
    }
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    let lpr = { line, character, endLine, endCharacter } as LineOrPositionOrRange
    if (typeof line === 'undefined' || (typeof endLine !== 'undefined' && typeof character !== typeof endCharacter)) {
        lpr = {}
    } else if (typeof character === 'undefined') {
        lpr = typeof endLine === 'undefined' ? { line } : { line, endLine }
    } else if (typeof endLine === 'undefined' || typeof endCharacter === 'undefined') {
        lpr = { line, character }
    } else {
        lpr = { line, character, endLine, endCharacter }
    }
    return lpr
}

function findLineKeyInSearchParameters(searchParameters: URLSearchParams): string | undefined {
    for (const key of searchParameters.keys()) {
        if (key.startsWith('L')) {
            return key
        }
        break
    }
    return undefined
}

function parseLineOrPosition(
    string: string
): { line: undefined; character: undefined } | { line: number; character?: number } {
    if (string.startsWith('L')) {
        string = string.slice(1)
    }
    const parts = string.split(':', 2)
    let line: number | undefined
    let character: number | undefined
    if (parts.length >= 1) {
        line = parseInt(parts[0], 10)
    }
    if (parts.length === 2) {
        character = parseInt(parts[1], 10)
    }
    line = typeof line === 'number' && isNaN(line) ? undefined : line
    character = typeof character === 'number' && isNaN(character) ? undefined : character
    if (typeof line === 'undefined') {
        return { line: undefined, character: undefined }
    }
    return { line, character }
}

/** The results of parsing a repo-revision string like "my/repo@my/revision". */
interface ParsedRepoRevision {
    repository: string

    /** The URI-decoded revision (e.g., "my#branch" in "my/repo@my%23branch"). */
    revision?: string

    /** The raw revision (e.g., "my%23branch" in "my/repo@my%23branch"). */
    rawRevision?: string
}

function parseRepoRevision(repoRevision: string): ParsedRepoRevision {
    const [repository, revision] = repoRevision.split('@', 2) as [string, string | undefined]
    return {
        repository: decodeURIComponent(repository),
        revision: revision && decodeURIComponent(revision),
        rawRevision: revision,
    }
}
