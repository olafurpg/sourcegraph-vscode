/* eslint-disable @typescript-eslint/no-unused-vars */
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { parseBrowserRepoURL } from './parseRepoUrl'
import { graphqlQuery } from './graphqlQuery'
import { log } from '../log'

const SOURCEGRAPH_ENDPOINT = 'https://sourcegraph.com'
const BROWSE_ROOT = `sourcegraph://${SOURCEGRAPH_ENDPOINT}`

export class BrowseFileSystemProvider
    implements
        vscode.TreeDataProvider<vscode.Uri>,
        vscode.FileSystemProvider,
        vscode.HoverProvider,
        vscode.DefinitionProvider,
        vscode.ReferenceProvider {
    public async getTreeItem(uri: vscode.Uri): Promise<vscode.TreeItem> {
        const blob = await this.fetchCheapBlob(uri)
        return {
            id: blob.uri.toString(),
            label: blob.name,
            collapsibleState:
                blob.type === vscode.FileType.Directory
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None,
        }
    }
    public async getChildren(uri?: vscode.Uri): Promise<vscode.Uri[] | undefined> {
        if (!uri) {
            return Promise.resolve(undefined)
        }
        const blob = await this.fetchCheapBlob(uri)
        return blob.children.map(child => child.uri)
    }
    public getParent(uri: vscode.Uri): vscode.Uri | undefined {
        if (uri.path === '' || uri.path === '/') {
            return undefined
        }
        const uriString = uri.toString()
        const slash = uriString.lastIndexOf('/')
        if (slash < 0) {
            return undefined
        }
        return vscode.Uri.parse(uriString.slice(0, slash))
    }
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<vscode.Uri, Blob>()
    private readonly cheapCache = new Map<vscode.Uri, CheapBlob>()

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
        log.appendLine(`URI: ${uri.toString(false)}`)
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
        const fromCache = this.cheapCache.get(uri)
        if (fromCache) {
            return Promise.resolve(fromCache)
        }
        const blob = await this.fetchBlob(uri)
        return this.makeCheap(blob)
    }
    private async fetchBlob(uri: vscode.Uri): Promise<Blob> {
        const result = this.cache.get(uri)
        if (result) {
            return result
        }
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
            throw new Error(`no parsed.path from uri ${uri.toString()}`)
        }
        const blobResult = await graphqlQuery<BlobParameters, BlobResult>(
            ContentQuery,
            {
                repository: parsed.repository,
                revision: parsed.revision,
                path: parsed.path,
            },
            token.token
        )
        if (blobResult) {
            const encoder = new TextEncoder()
            const toCacheResult: Blob = {
                uri,
                repository: parsed.repository,
                revision: parsed.revision,
                content: encoder.encode(blobResult.data.repository.commit.blob.content),
                path: parsed.path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.File,
                children: [],
            }
            this.cache.set(uri, toCacheResult)
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
        if (directoryResult) {
            const children: CheapBlob[] = directoryResult.data.repository.commit.tree.entries.map(entry => ({
                uri: vscode.Uri.parse(BROWSE_ROOT + entry.url),
                name: entry.name,
                type: entry.isDirectory ? vscode.FileType.Directory : vscode.FileType.File,
                children: [],
                isShallow: true,
            }))

            for (const child of children) {
                this.cheapCache.set(child.uri, child)
            }

            const toCacheResult: Blob = {
                uri,
                repository: parsed.repository,
                revision: parsed.revision,
                content: new Uint8Array(0),
                path: parsed.path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.Directory,
                children,
            }
            this.cache.set(uri, toCacheResult)
            this.cheapCache.set(uri, this.makeCheap(toCacheResult))
            return toCacheResult
        }
        log.appendLine(`no blob result for ${uri.toString()}`)
        throw new Error(`Not found '${uri.toString()}'`)
    }

    private makeCheap(blob: Blob): CheapBlob {
        const parts = blob.uri.path.split('/')
        return {
            uri: blob.uri,
            type: blob.type,
            name: parts[parts.length - 1],
            children: blob.children,
            isShallow: false,
        }
    }
}

// interface StatParameters {}
// interface StatResult {}
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
query Directory($repoName: String!, $revision: String!, $filePath: String!) {
  repository(name: $repoName) {
    commit(rev: "", inputRevspec: $revision) {
      tree(path: $filePath) {
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
    data: {
        repository: {
            commit: {
                tree: {
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
    isShallow: boolean
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
}
