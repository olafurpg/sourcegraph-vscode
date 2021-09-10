import { URL } from 'url'
import * as vscode from 'vscode'

export interface ParsedRepoURI {
    repository: string
    revision: string | undefined
    commitID: string | undefined
    path: string | undefined
    position: vscode.Position | undefined
    range: vscode.Range | undefined
}

export function parseRepoURI(parsed: URL): ParsedRepoURI {
    const repository = parsed.hostname + decodeURIComponent(parsed.pathname)
    const revision = decodeURIComponent(parsed.search.slice('?'.length)) || undefined
    let commitID: string | undefined
    if (revision?.match(/[\dA-f]{40}/)) {
        commitID = revision
    }
    const fragmentSplit = parsed.hash.slice('#'.length).split(':').map(decodeURIComponent)
    let filePath: string | undefined
    let position: vscode.Position | undefined
    let range: vscode.Range | undefined
    if (fragmentSplit.length === 1) {
        filePath = fragmentSplit[0]
    }
    if (fragmentSplit.length === 2) {
        filePath = fragmentSplit[0]
        const rangeOrPosition = fragmentSplit[1]
        const rangeOrPositionSplit = rangeOrPosition.split('-')

        if (rangeOrPositionSplit.length === 1) {
            position = parsePosition(rangeOrPositionSplit[0])
        }
        if (rangeOrPositionSplit.length === 2) {
            range = new vscode.Range(parsePosition(rangeOrPositionSplit[0]), parsePosition(rangeOrPositionSplit[1]))
        }
        if (rangeOrPositionSplit.length > 2) {
            throw new Error('unexpected range or position: ' + rangeOrPosition)
        }
    }
    if (fragmentSplit.length > 2) {
        throw new Error('unexpected fragment: ' + parsed.hash)
    }

    return { repository, revision, commitID, path: filePath || undefined, position, range }
}

function parsePosition(string: string): vscode.Position {
    const split = string.split(',')
    if (split.length === 1) {
        return new vscode.Position(parseInt(string, 10), 0)
    }
    if (split.length === 2) {
        return new vscode.Position(parseInt(split[0], 10), parseInt(split[1], 10))
    }
    throw new Error('unexpected position: ' + string)
}
