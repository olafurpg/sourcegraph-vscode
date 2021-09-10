// import got from 'got/dist/source'
    import {execSync } from 'child_process'
// import shell from 'shelljs'
import open from 'open'
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { getSourcegraphUrl } from './config'
import { repoInfo } from './git'
// import fetch from 'node-fetch'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { version } = require('../package.json')

/**
 * Displays an error message to the user.
 */
async function showError(error: Error): Promise<void> {
    await vscode.window.showErrorMessage(error.message)
}

const handleCommandErrors = <P extends unknown[], R>(command: (...args: P) => Promise<R>) => async (
    ...args: P
): Promise<R | void> => {
    try {
        return await command(...args)
    } catch (error) {
        if (error instanceof Error) {
            await showError(error)
        }
    }
}

/**
 * The command implementation for opening a cursor selection on Sourcegraph.
 */
async function openCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    const { remoteURL, branch, fileRelative } = repositoryInfo

    // Open in browser.
    await open(
        `${getSourcegraphUrl()}/-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRelative)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(version)}` +
            `&start_row=${encodeURIComponent(String(editor.selection.start.line))}` +
            `&start_col=${encodeURIComponent(String(editor.selection.start.character))}` +
            `&end_row=${encodeURIComponent(String(editor.selection.end.line))}` +
            `&end_col=${encodeURIComponent(String(editor.selection.end.character))}`
    )
}

async function browseCommand(): Promise<void> {
    const clipboard = await vscode.env.clipboard.readText()
    const value = clipboard.startsWith('https://sourcegraph.com') ? clipboard : ''
    const input = await vscode.window.showInputBox({
        value,
    })

    if (input) {
        const uri = vscode.Uri.parse(input.replace('https://', 'sourcegraph://'))
        const textDocument = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(textDocument)
    }
}

function graphqlQuery<A, B>(query: string, variables: A): Promise<B | undefined> {
    const apiArguments: string[] = []
    for (const key in variables) {
        if (Object.prototype.hasOwnProperty.call(variables, key)) {
           // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
           apiArguments.push(`'${key}=${variables[key]}'`)
        }
    }
    const command = `src api -query='${query}' ${apiArguments.join(' ')}`
    // TODO: do direct HTTP query to the GraphQL API instead of shelling out to src.
    const json = execSync(command).toString()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: B = JSON.parse(json)
    return Promise.resolve(parsed) // wrap in promise because this method will be async in the future
}

interface ParsedRepoURI {
    repoName: string
    revision: string | undefined
    commitID: string | undefined
    filePath: string | undefined
    position: vscode.Position | undefined
    range: vscode.Range | undefined
}

export function parseRepoURI(parsed: URL): ParsedRepoURI {
    const repoName = parsed.hostname + decodeURIComponent(parsed.pathname)
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

    return { repoName, revision, commitID, filePath: filePath || undefined, position, range }
}

const parsePosition = (string: string): vscode.Position => {
    const split = string.split(',')
    if (split.length === 1) {
        return new vscode.Position(parseInt(string, 10), 0)
    }
    if (split.length === 2) {
        return new vscode.Position(parseInt(split[0], 10), parseInt(split[1], 10))
    }
    throw new Error('unexpected position: ' + string)
}

/**
 * The command implementation for searching a cursor selection on Sourcegraph.
 */
async function searchCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    const { remoteURL, branch, fileRelative } = repositoryInfo

    const query = editor.document.getText(editor.selection)
    if (query === '') {
        return // nothing to query
    }

    // Search in browser.
    await open(
        `${getSourcegraphUrl()}/-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRelative)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(version)}` +
            `&search=${encodeURIComponent(query)}`
    )
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand('extension.open', handleCommandErrors(openCommand)))
    context.subscriptions.push(vscode.commands.registerCommand('extension.search', handleCommandErrors(searchCommand)))
    context.subscriptions.push(vscode.commands.registerCommand('extension.browse', handleCommandErrors(browseCommand)))
    vscode.workspace.registerFileSystemProvider('sourcegraph', new SourcegraphFileSystemProvider(), {
        isReadonly: true,
    })
}

// interface StatParameters {}
// interface StatResult {}
// interface RevisionParameters {}
// interface RevisionResult {
//     revision: string
// }
interface BlobParameters {
    repository: string
    revision: string
    path: string
}
interface BlobResult {
    data: {
        repository: {
            commit: {
                blob: {
                    content: string
                }
            }
        }
    }
}
const ContentQuery = 'query Content($repository: String!, $revision: String!, $path: String!) { repository(name: $repository) { commit(rev: $revision) { blob(path: $path) { content } } } } '

class SourcegraphFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    public stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const time = new Date().getMilliseconds()
        return Promise.resolve({
            mtime: time,
            ctime: time,
            size: 123,
            type: vscode.FileType.File,
        })
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        // const parsed = parseRepoURI(new URL(uri.toString()))
        // const revision: string = parsed.revision || (await graphqlQuery<RevisionParameters, RevisionResult>('', {}))?.revision || ''
        const result = await graphqlQuery<BlobParameters, BlobResult>(ContentQuery, {
            repository: 'github.com/Netflix/Hystrix',
            revision: 'master',
            path: 'hystrix-core/src/main/java/com/netflix/hystrix/AbstractCommand.java',
        })
        if (result) {
            const encoder = new TextEncoder()
            return encoder.encode(result.data.repository.commit.blob.content)
        }
        throw new Error('Method not implemented.')
    }
    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return []
    }

    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Method not implemented.')
    }
    public writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): void | Thenable<void> {
        throw new Error('Method not implemented.')
    }
    public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw new Error('Method not implemented.')
    }
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw new Error('Method not implemented.')
    }
    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        throw new Error('Method not implemented.')
    }
}

export function deactivate(): void {
    // no-op
}
