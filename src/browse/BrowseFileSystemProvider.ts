/* eslint-disable @typescript-eslint/no-unused-vars */
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { parseBrowserRepoURL } from './parseRepoUrl'
import { graphqlQuery } from './graphqlQuery'
import { log } from '../log'

export class BrowseFileSystemProvider
    implements vscode.FileSystemProvider, vscode.HoverProvider, vscode.DefinitionProvider, vscode.ReferenceProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<vscode.Uri, Blob>()

    public provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.Location[]> {
        throw new Error('Method not implemented.')
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const blob = await this.fetchBlob(document.uri)
        const definition = await graphqlQuery<DefinitionParameters, DefinitionResult>(DefinitionQuery, {
            repository: blob.repository,
            revision: blob.revision,
            path: blob.path,
            line: position.line,
            character: position.character,
        })
        if (!definition) {
            return undefined
        }
        const locations: vscode.Location[] = definition.data.repository.commit.blob.lsif.definitions.nodes.map(node =>
            this.nodeToLocation(node)
        )
        return locations
    }

    private nodeToLocation(node: DefinitionNode): vscode.Location {
        log.appendLine(`node=${JSON.stringify(node)}`)
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
        const hover = await graphqlQuery<HoverParameters, HoverResult>(HoverQuery, {
            repository: blob.repository,
            revision: blob.revision,
            path: blob.path,
            line: position.line,
            character: position.character,
        })
        if (!hover) {
            return undefined
        }
        return {
            contents: [new vscode.MarkdownString(hover.data.repository.commit.blob.lsif.hover.markdown.text)],
        }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const blob = await this.fetchBlob(uri)
        return {
            mtime: blob.time,
            ctime: blob.time,
            size: blob.content.length,
            type: vscode.FileType.File,
        }
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const blob = await this.fetchBlob(uri)
        return blob.content
    }
    public readDirectory(uri: vscode.Uri): [string, vscode.FileType][] | Thenable<[string, vscode.FileType][]> {
        return []
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

    private async fetchBlob(uri: vscode.Uri): Promise<Blob> {
        const result = this.cache.get(uri)
        if (result) {
            return result
        }
        const url = new URL(uri.toString(true).replace('sourcegraph://', 'https://'))
        const parsed = parseBrowserRepoURL(url)
        if (!parsed.revision) {
            const revisionResult = await graphqlQuery<RevisionParameters, RevisionResult>(RevisionQuery, {
                repository: parsed.repository,
            })
            parsed.revision = revisionResult?.data.repositoryRedirect.commit.oid
        }
        if (!parsed.revision) {
            throw new Error(`no parsed.revision from uri ${uri.toString()}`)
        }
        if (!parsed.path) {
            throw new Error(`no parsed.path from uri ${uri.toString()}`)
        }
        const blobResult = await graphqlQuery<BlobParameters, BlobResult>(ContentQuery, {
            repository: parsed.repository,
            revision: parsed.revision,
            path: parsed.path,
        })
        if (blobResult) {
            const encoder = new TextEncoder()
            const toCacheResult: Blob = {
                repository: parsed.repository,
                revision: parsed.revision,
                content: encoder.encode(blobResult.data.repository.commit.blob.content),
                path: parsed.path,
                time: new Date().getMilliseconds(),
            }
            this.cache.set(uri, toCacheResult)
            return toCacheResult
        }
        throw new Error(`Not found '${uri.toString()}'`)
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
                            nodes: DefinitionNode[]
                        }
                    }
                }
            }
        }
    }
}
interface DefinitionNode {
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
export const HoverQuery = `
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

export interface Blob {
    repository: string
    revision: string
    path: string
    content: Uint8Array
    time: number
}
