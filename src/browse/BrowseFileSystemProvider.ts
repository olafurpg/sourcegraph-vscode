/* eslint-disable @typescript-eslint/no-unused-vars */
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { parseBrowserRepoURL, ParsedRepoURI, repoUriParent, repoUriRepository } from './parseRepoUrl'
import { graphqlQuery } from './graphqlQuery'
import { log } from '../log'
import { FileTree } from './FileTree'

export class BrowseFileSystemProvider
    implements
        vscode.TreeDataProvider<string>,
        vscode.FileSystemProvider,
        vscode.HoverProvider,
        vscode.DefinitionProvider,
        vscode.ReferenceProvider {
    private isTreeViewVisible: boolean = false
    private isExpandedNode = new Set<string>()
    private treeView: vscode.TreeView<string> | undefined
    private activeUri: vscode.Uri | undefined
    private files: Map<string, Promise<FilesResult | undefined>> = new Map()
    private readonly uriEmitter = new vscode.EventEmitter<string | undefined>()
    public readonly onDidChangeTreeData: vscode.Event<string | undefined> = this.uriEmitter.event
    public setTreeView(treeView: vscode.TreeView<string>): void {
        this.treeView = treeView
        treeView.onDidChangeVisibility(event => {
            const didBecomeVisible = !this.isTreeViewVisible && event.visible
            this.isTreeViewVisible = event.visible
            if (didBecomeVisible) {
                this.didFocus(this.activeUri)
            }
        })
        treeView.onDidExpandElement(event => {
            this.isExpandedNode.add(event.element)
        })
        treeView.onDidCollapseElement(event => {
            this.isExpandedNode.delete(event.element)
        })
    }
    public async didFocus(uri: vscode.Uri | undefined): Promise<void> {
        this.activeUri = uri
        if (uri && uri.scheme === 'sourcegraph' && this.treeView && this.isTreeViewVisible) {
            await this.didFocusString(uri.toString(true), true)
        }
    }
    private async didFocusString(uri: string, isDestinationNode: boolean): Promise<void> {
        try {
            if (this.treeView) {
                const parent = repoUriParent(uri)
                if (parent && !this.isExpandedNode.has(parent)) {
                    await this.didFocusString(parent, false)
                }
                log.appendLine(`FOCUS: uri=${uri} isDestinationNode=${isDestinationNode}`)
                await this.treeView.reveal(uri, {
                    focus: true,
                    select: isDestinationNode,
                    expand: !isDestinationNode,
                })
            }
        } catch (error) {
            log.appendLine(`ERROR: didFocusString(${uri}) error=${error}`)
        }
    }
    public async getTreeItem(uri: string): Promise<vscode.TreeItem> {
        try {
            // log.appendLine(`getTreeItem ${id} blob.type=${vscode.FileType[blob.type]} command=${JSON.stringify(command)}`)
            const parsed = parseUri(uri)
            const label = parsed.path ? this.filename(parsed.path) : parsed.repository
            const isFile = uri.includes('/-/blob/')
            const isDirectory = !isFile
            const collapsibleState = await this.getCollapsibleState(uri, isDirectory)
            const command = isFile
                ? {
                      command: 'extension.openFile',
                      title: 'Open file',
                      arguments: [uri],
                  }
                : undefined
            return {
                id: uri,
                label,
                tooltip: uri.replace('sourcegraph://', 'https://'),
                collapsibleState,
                command,
                resourceUri: vscode.Uri.parse(uri),
            }
        } catch (error) {
            log.appendLine(`ERROR: getTreeItem(${uri}) error=${error}`)
            return Promise.resolve({})
        }
    }
    private async getCollapsibleState(uri: string, isDirectory: boolean): Promise<vscode.TreeItemCollapsibleState> {
        const parent = repoUriParent(uri)
        if (isDirectory && parent) {
            const parsedParent = parseUri(parent)
            if (parsedParent.path) {
                const tree = await this.getFileTree(parsedParent)
                const directChildren = tree?.directChildren(parsedParent.path)
                if (directChildren && directChildren.length === 1) {
                    return vscode.TreeItemCollapsibleState.Expanded
                }
            }
        }
        return isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }
    private async getFileTree(parsed: ParsedRepoURI): Promise<FileTree | undefined> {
        if (typeof parsed.path === 'undefined') {
            log.appendLine(`getFileTree - empty parsed.path`)
            return Promise.resolve(undefined)
        }
        const downloading = this.files.get(parsed.repository)
        if (!downloading) {
            log.appendLine(`getFileTree - empty downloading`)
            return Promise.resolve(undefined)
        }
        const files = (await downloading)?.data?.repository?.commit?.fileNames
        if (!files) {
            log.appendLine(`getFileTree - empty files`)
            return Promise.resolve(undefined)
        }
        // log.appendLine(`new FileTree(${JSON.stringify(files)})`)
        return new FileTree(parsed, files)
    }
    public async getChildren(uri?: string): Promise<string[] | undefined> {
        try {
            if (!uri) {
                const repos = [...this.repos]
                // log.appendLine(`getChildren(undefined) repos=${JSON.stringify(repos)}`)
                return Promise.resolve(repos.map(repo => repo.replace('https://', 'sourcegraph://')))
            }
            const parsed = parseUri(uri)
            if (typeof parsed.path === 'undefined') {
                parsed.path = ''
            }
            const tree = await this.getFileTree(parsed)
            const result = tree?.directChildren(parsed.path)
            // log.appendLine(`getChildren(${uri}) path=${parsed.path} tree=${tree} result=${JSON.stringify(result)}`)
            return result
        } catch (error) {
            log.appendLine(`ERROR: getChildren(${uri}) error=${error}`)
            return Promise.resolve(undefined)
        }
    }
    public getParent(uri: string): string | undefined {
        return repoUriParent(uri)
    }
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<string, Blob>()
    private readonly repos = new Set<string>()

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        const blob = await this.fetchBlob(document.uri.toString(true))
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
        const blob = await this.fetchBlob(document.uri.toString(true))
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
        const blob = await this.fetchBlob(document.uri.toString(true))
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
        // log.appendLine(`STAT: ${uri.toString(true)}`)
        const blob = await this.fetchBlob(uri.toString(true))
        return {
            mtime: blob.time,
            ctime: blob.time,
            size: blob.content.length,
            type: blob.type,
        }
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const blob = await this.fetchBlob(uri.toString(true))
        return blob.content
    }
    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const parsed = parseUri(uri.toString(true))
        if (typeof parsed.path === 'undefined') {
            parsed.path = ''
        }
        const tree = await this.getFileTree(parsed)
        if (!tree) {
            return []
        }
        const children = tree.directChildren(parsed.path)
        return children.map(child => {
            const isDirectory = child.includes('/-/tree/')
            const type = isDirectory ? vscode.FileType.Directory : vscode.FileType.File
            return [child, type]
        })
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

    // private async fetchCheapBlob(uri: string): Promise<CheapBlob> {
    //     const fromCache = this.cheapCache.get(uri)
    //     if (fromCache) {
    //         return Promise.resolve(fromCache)
    //     }
    //     const blob = await this.fetchBlob(uri)
    //     return this.makeCheap(blob)
    // }
    private async fetchBlob(uri: string): Promise<Blob> {
        const result = this.cache.get(uri)
        if (result) {
            return result
        }
        const url = new URL(uri.replace('sourcegraph://', 'https://'))
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
        if (typeof parsed.path === 'undefined') {
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
        const downloadingFiles = this.files.get(parsed.repository)
        if (!downloadingFiles) {
            this.files.set(
                parsed.repository,
                graphqlQuery<FilesParameters, FilesResult>(
                    FilesQuery,
                    {
                        repository: parsed.repository,
                        revision: parsed.revision,
                    },
                    new vscode.CancellationTokenSource().token
                )
            )
        }
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
            }
            this.updateCache(toCacheResult)
            return toCacheResult
        }
        log.appendLine(`no blob result for ${uri.toString()}`)
        throw new Error(`Not found '${uri.toString()}'`)
    }

    private updateCache(blob: Blob) {
        const repo = repoUriRepository(parseUri(blob.uri))
        this.cache.set(blob.uri, blob)
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
}

function parseUri(uri: string): ParsedRepoURI {
    return parseBrowserRepoURL(new URL(uri.replace('sourcegraph://', 'https://')))
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
const FilesQuery = `
query FileNames($repository: String!, $revision: String!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      fileNames
    }
  }
}
`
interface FilesParameters {
    repository: string
    revision: string
}
interface FilesResult {
    data?: {
        repository?: {
            commit?: {
                fileNames?: string[]
            }
        }
    }
}

// const DirectoryQuery = `
// query Directory($repository: String!, $revision: String!, $path: String!) {
//   repository(name: $repository) {
//     commit(rev: "", inputRevspec: $revision) {
//       tree(path: $path) {
//         ...TreeFields
//       }
//     }
//   }
// }

// fragment TreeFields on GitTree {
//   isRoot
//   url
//   entries(first: 2500, recursiveSingleChild: true) {
//     ...TreeEntryFields
//   }
// }

// fragment TreeEntryFields on TreeEntry {
//   name
//   path
//   isDirectory
//   url
//   submodule {
//     url
//     commit
//   }
//   isSingleChild
// }
// `
// interface DirectoryParameters {
//     repository: string
//     revision: string
//     path: string
// }
// interface DirectoryResult {
//     data?: {
//         repository?: {
//             commit?: {
//                 tree?: {
//                     isRoot: boolean
//                     url: string
//                     entries: DirectoryEntry[]
//                 }
//             }
//         }
//     }
// }
// interface DirectoryEntry {
//     name: string
//     path: string
//     isDirectory: boolean
//     url: string
//     submodule: string
//     isSingleChild: boolean
// }

interface Blob {
    uri: string
    repository: string
    revision: string
    path: string
    content: Uint8Array
    time: number
    type: vscode.FileType
}
