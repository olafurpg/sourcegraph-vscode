/* eslint-disable @typescript-eslint/no-unused-vars */
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { parseBrowserRepoURL, ParsedRepoURI, repoUriParent, repoUriRepository } from './parseRepoUrl'
import { graphqlQuery } from './graphqlQuery'
import { log } from '../log'

export class BrowseFileSystemProvider
    implements
        vscode.TreeDataProvider<vscode.Uri>,
        vscode.FileSystemProvider,
        vscode.HoverProvider,
        vscode.DefinitionProvider,
        vscode.ReferenceProvider {
    public treeView: vscode.TreeView<vscode.Uri> | undefined
    private readonly uriEmitter = new vscode.EventEmitter<vscode.Uri | undefined>()
    public readonly onDidChangeTreeData: vscode.Event<vscode.Uri | undefined> = this.uriEmitter.event
    public async didFocus(uri: vscode.Uri): Promise<void> {
        log.appendLine(`FOCUS: ${uri.toString(true)}`)
        if (this.treeView) {
            await this.treeView.reveal(uri, {
                focus: true,
                select: true,
                expand: 3,
            })
        }
    }
    public async getTreeItem(uri: vscode.Uri): Promise<vscode.TreeItem> {
        const blob = await this.fetchCheapBlob(uri)
        const id = blob.uri.toString(true)
        const command =
            blob.type === vscode.FileType.File
                ? {
                      command: 'extension.openFile',
                      title: 'Open file',
                      arguments: [id],
                  }
                : undefined
        // log.appendLine(`getTreeItem ${id} blob.type=${vscode.FileType[blob.type]} command=${JSON.stringify(command)}`)
        return {
            id,
            label: blob.name,
            tooltip: id.replace('sourcegraph://', 'https://'),
            collapsibleState: cheapBlobCollapsibleState(blob),
            command,
            resourceUri: blob.uri,
        }
    }
    public async getChildren(uri?: vscode.Uri): Promise<vscode.Uri[] | undefined> {
        if (!uri) {
            return Promise.resolve([...this.repos].map(repo => vscode.Uri.parse(repo)))
        }
        let blob = await this.fetchCheapBlob(uri)
        if (blob.isShallow) {
            blob = this.makeCheap(await this.fetchBlob(uri))
        }
        return blob.children.map(child => child.uri)
    }
    public getParent(uri: vscode.Uri): vscode.Uri | undefined {
        const parent = repoUriParent(uri.toString(true))
        return parent ? vscode.Uri.parse(parent) : undefined
    }
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<string, Blob>()
    private readonly repos = new Set<string>()
    private readonly cheapCache = new Map<string, CheapBlob>()

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        const blob = await this.fetchBlob(document.uri)
        const definition = await graphqlQuery<ReferencesParameters, ReferencesResult>(
            ReferencesQuery,
            {
                repository: blob.repository,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return definition?.data.repository.commit.blob.lsif.references.nodes.map(node => this.nodeToLocation(node))
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const blob = await this.fetchBlob(document.uri)
        const definition = await graphqlQuery<DefinitionParameters, DefinitionResult>(
            DefinitionQuery,
            {
                repository: blob.repository,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return definition?.data.repository.commit.blob.lsif.definitions.nodes.map(node => this.nodeToLocation(node))
    }

    private nodeToLocation(node: LocationNode): vscode.Location {
        return new vscode.Location(
            vscode.Uri.parse(
                `sourcegraph://sourcegraph.com/${node.resource.repository.name}@${node.resource.commit.oid}/-/blob/${node.resource.path}`
            ),
            new vscode.Range(
                new vscode.Position(node.range.start.line, node.range.start.character),
                new vscode.Position(node.range.end.line, node.range.end.character)
            )
        )
    }

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Hover | undefined> {
        const blob = await this.fetchBlob(document.uri)
        const hover = await graphqlQuery<HoverParameters, HoverResult>(
            HoverQuery,
            {
                repository: blob.repository,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        if (!hover) {
            return undefined
        }
        return {
            contents: [new vscode.MarkdownString(hover.data.repository.commit.blob.lsif.hover.markdown.text)],
        }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        log.appendLine(`STAT: ${uri.toString(true)}`)
        const blob = await this.fetchBlob(uri)
        return {
            mtime: blob.time,
            ctime: blob.time,
            size: blob.content.length,
            type: blob.type,
        }
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const blob = await this.fetchBlob(uri)
        return blob.content
    }
    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const blob = await this.fetchBlob(uri)
        if (blob.type !== vscode.FileType.Directory) {
            throw new Error(`not a directory: ${uri.toString()}`)
        }
        return blob.children.map(child => [child.name, child.type])
    }

    // Unsupported methods for readonly file systems.
    public createDirectory(uri: vscode.Uri): void | Thenable<void> {
        throw new Error('Method not supported.')
    }
    public writeFile(
        uri: vscode.Uri,
        content: Uint8Array,
        options: { create: boolean; overwrite: boolean }
    ): void | Thenable<void> {
        throw new Error('Method not supported.')
    }
    public delete(uri: vscode.Uri, options: { recursive: boolean }): void | Thenable<void> {
        throw new Error('Method not supported.')
    }
    public rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void | Thenable<void> {
        throw new Error('Method not supported.')
    }
    public watch(uri: vscode.Uri, options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        throw new Error('Method not supported.')
    }

    private async fetchCheapBlob(uri: vscode.Uri): Promise<CheapBlob> {
        const fromCache = this.cheapCache.get(uri.toString(true))
        if (fromCache) {
            return Promise.resolve(fromCache)
        }
        const blob = await this.fetchBlob(uri)
        return this.makeCheap(blob)
    }
    private async fetchBlob(uri: vscode.Uri): Promise<Blob> {
        const result = this.cache.get(uri.toString(true))
        if (result) {
            return result
        }
        log.appendLine(`URI: ${uri.toString(true)}`)
        const url = new URL(uri.toString(true).replace('sourcegraph://', 'https://'))
        const parsed = parseBrowserRepoURL(url)
        const token = new vscode.CancellationTokenSource()
        if (!parsed.revision) {
            const revisionResult = await graphqlQuery<RevisionParameters, RevisionResult>(
                RevisionQuery,
                {
                    repository: parsed.repository,
                },
                token.token
            )
            parsed.revision = revisionResult?.data.repositoryRedirect.commit.oid
        }
        if (!parsed.revision) {
            throw new Error(`no parsed.revision from uri ${uri.toString()}`)
        }
        if (!parsed.path) {
            parsed.path = ''
        }
        const contentResult = await graphqlQuery<ContentParameters, ContentResult>(
            ContentQuery,
            {
                repository: parsed.repository,
                revision: parsed.revision,
                path: parsed.path,
            },
            token.token
        )
        const content = contentResult?.data?.repository?.commit?.blob?.content
        if (content) {
            const encoder = new TextEncoder()
            const toCacheResult: Blob = {
                uri,
                repository: parsed.repository,
                revision: parsed.revision,
                content: encoder.encode(content),
                path: parsed.path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.File,
                children: [],
            }
            this.updateCache(toCacheResult)
            return toCacheResult
        }
        const directoryResult = await graphqlQuery<DirectoryParameters, DirectoryResult>(
            DirectoryQuery,
            {
                repository: parsed.repository,
                revision: parsed.revision,
                path: parsed.path,
            },
            new vscode.CancellationTokenSource().token
        )
        const children: CheapBlob[] | undefined = directoryResult?.data?.repository?.commit?.tree?.entries.map(
            entry => {
                const childUri = vscode.Uri.parse(`sourcegraph://${uri.authority}${entry.url}`)
                // log.appendLine(`childUri=${childUri}`)
                return {
                    uri: childUri,
                    name: entry.name,
                    type: entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
                    children: [],
                    isShallow: true,
                    isSingleChild: entry.isSingleChild,
                }
            }
        )
        if (Array.isArray(children)) {
            for (const child of children) {
                this.updateCheapCache(child)
            }
            const toCacheResult: Blob = {
                uri,
                repository: parsed.repository,
                revision: parsed.revision,
                content: new Uint8Array(0),
                path: parsed.path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.Directory,
                children: [],
            }
            this.updateCache(toCacheResult)
            this.updateCheapCache(this.makeCheap(toCacheResult))

            for (const child of children) {
                const parent = repoUriParent(child.uri.toString(true))
                if (parent) {
                    const parentBlob = this.cheapCache.get(parent)
                    if (parentBlob) {
                        parentBlob.children.push(child)
                    } else {
                        const keys = [...this.cheapCache.keys()]
                        log.appendLine(`repoUriParent child=${child.uri.toString(true)} parent=${parent}`)
                        log.appendLine(`KEYS: ${keys.join('\n')}`)
                    }
                }
            }
            return toCacheResult
        }
        log.appendLine(`no blob result for ${uri.toString()}`)
        throw new Error(`Not found '${uri.toString()}'`)
    }

    private updateCheapCache(blob: CheapBlob) {
        this.cheapCache.set(blob.uri.toString(true), blob)
    }

    private updateCache(blob: Blob) {
        const repo = repoUriRepository(parseUri(blob.uri))
        this.cache.set(blob.uri.toString(true), blob)
        const isNew = !this.repos.has(repo)
        if (isNew) {
            this.repos.add(repo)
            this.uriEmitter.fire(undefined)
        }
    }

    private filename(path: string): string {
        const parts = path.split('/')
        return parts[parts.length - 1]
    }
    private makeCheap(blob: Blob): CheapBlob {
        const parsed = parseBrowserRepoURL(new URL(blob.uri.toString(true)))
        const revision = parsed.revision ? `@${parsed.revision}` : ''
        const name = parsed.path ? this.filename(blob.path) : parsed.repository + revision
        return {
            uri: blob.uri,
            type: blob.type,
            name,
            children: blob.children,
            isShallow: false,
            isSingleChild: blob.isSingleChild || false,
        }
    }
}

function parseUri(uri: vscode.Uri): ParsedRepoURI {
    return parseBrowserRepoURL(new URL(uri.toString(true)))
}

interface RevisionParameters {
    repository: string
}
interface RevisionResult {
    data: {
        repositoryRedirect: {
            commit: {
                oid: string
                tree: {
                    url: string
                }
            }
        }
    }
}
interface ContentParameters {
    repository: string
    revision: string
    path: string
}

interface ContentResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    content?: string
                }
            }
        }
    }
}
const RevisionQuery = `
query Revision($repository: String!) {
  repositoryRedirect(name: $repository) {
    ... on Repository {
      mirrorInfo {
        cloneInProgress
        cloneProgress
        cloned
      }
      commit(rev: "") {
        oid
        tree(path: "") {
          url
        }
      }
      defaultBranch {
        abbrevName
      }
    }
    ... on Redirect {
      url
    }
  }
}`
export const ContentQuery = `
query Content($repository: String!, $revision: String!, $path: String!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        content
      }
    }
  }
}`

interface Position {
    line: number
    character: number
}

interface Range {
    start: Position
    end: Position
}

interface PositionParameters {
    repository: string
    revision: string
    path: string
    line: number
    character: number
}

type DefinitionParameters = PositionParameters
interface DefinitionResult {
    data: {
        repository: {
            commit: {
                blob: {
                    lsif: {
                        definitions: {
                            nodes: LocationNode[]
                        }
                    }
                }
            }
        }
    }
}
interface LocationNode {
    resource: {
        path: string
        repository: {
            name: string
        }
        commit: {
            oid: string
        }
    }
    range: Range
}
export const DefinitionQuery = `
query Definition($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          definitions(line: $line, character: $character) {
            nodes {
              resource {
                path
                repository {
                  name
                }
                commit {
                  oid
                }
              }
              range {
                start {
                  line
                  character
                }
                end {
                  line
                  character
                }
              }
            }
          }
        }
      }
    }
  }
}
`

interface HoverResult {
    data: {
        repository: {
            commit: {
                blob: {
                    lsif: {
                        hover: {
                            markdown: {
                                text: string
                            }
                            range: Range
                        }
                    }
                }
            }
        }
    }
}

type HoverParameters = PositionParameters
interface HoverResult {
    data: {
        repository: {
            commit: {
                blob: {
                    lsif: {
                        hover: {
                            markdown: {
                                text: string
                            }
                            range: Range
                        }
                    }
                }
            }
        }
    }
}
const HoverQuery = `
query Hover($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          hover(line: $line, character: $character) {
            markdown {
              text
            }
            range {
              start {
                line
                character
              }
              end {
                line
                character
              }
            }
          }
        }
      }
    }
  }
}
`

type ReferencesParameters = PositionParameters
interface ReferencesResult {
    data: {
        repository: {
            commit: {
                blob: {
                    lsif: {
                        references: {
                            nodes: LocationNode[]
                        }
                    }
                }
            }
        }
    }
}

export const ReferencesQuery = `
query References($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!, $after: String) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          references(line: $line, character: $character, after: $after) {
            nodes {
              resource {
                path
                repository {
                  name
                }
                commit {
                  oid
                }
              }
              range {
                start {
                  line
                  character
                }
                end {
                  line
                  character
                }
              }
            }
            pageInfo {
              endCursor
            }
          }
        }
      }
    }
  }
}
`

const DirectoryQuery = `
query Directory($repository: String!, $revision: String!, $path: String!) {
  repository(name: $repository) {
    commit(rev: "", inputRevspec: $revision) {
      tree(path: $path) {
        ...TreeFields
      }
    }
  }
}

fragment TreeFields on GitTree {
  isRoot
  url
  entries(first: 2500, recursiveSingleChild: true) {
    ...TreeEntryFields
  }
}

fragment TreeEntryFields on TreeEntry {
  name
  path
  isDirectory
  url
  submodule {
    url
    commit
  }
  isSingleChild
}
`
interface DirectoryParameters {
    repository: string
    revision: string
    path: string
}
interface DirectoryResult {
    data?: {
        repository?: {
            commit?: {
                tree?: {
                    isRoot: boolean
                    url: string
                    entries: DirectoryEntry[]
                }
            }
        }
    }
}
interface DirectoryEntry {
    name: string
    path: string
    isDirectory: boolean
    url: string
    submodule: string
    isSingleChild: boolean
}

interface CheapBlob {
    uri: vscode.Uri
    name: string
    type: vscode.FileType
    children: CheapBlob[]
    isSingleChild: boolean
    isShallow: boolean
}

function cheapBlobCollapsibleState(blob: CheapBlob): vscode.TreeItemCollapsibleState {
    switch (blob.type) {
        case vscode.FileType.Directory:
            return blob.isSingleChild
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed
        default:
            return vscode.TreeItemCollapsibleState.None
    }
}
interface Blob {
    uri: vscode.Uri
    repository: string
    revision: string
    path: string
    content: Uint8Array
    time: number
    type: vscode.FileType
    children: CheapBlob[]
    isSingleChild?: boolean
}
