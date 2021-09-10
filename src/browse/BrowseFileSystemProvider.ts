/* eslint-disable @typescript-eslint/no-unused-vars */
import { URL } from 'url'
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { log } from '../log'
import { parseRepoURI } from './parseRepoUri'
import { graphqlQuery } from './graphqlQuery'

export class BrowseFileSystemProvider implements vscode.FileSystemProvider {
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<vscode.Uri, Blob>()
    private async cacheUri(uri: vscode.Uri): Promise<Blob> {
        const result = this.cache.get(uri)
        if (result) {
            return result
        }
        const parsed = parseRepoURI(new URL(uri.toString()))
        if (!parsed.revision) {
            const revisionResult = await graphqlQuery<RevisionParameters, RevisionResult>(RevisionQuery, {
                repository: parsed.repository,
                revision: '',
            })

            log.appendLine(JSON.stringify(revisionResult?.data))
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
                content: encoder.encode(blobResult.data.repository.commit.blob.content),
                path: parsed.path,
                time: new Date().getMilliseconds(),
            }
            this.cache.set(uri, toCacheResult)
            return toCacheResult
        }
        throw new Error(`Not found '${uri.toString()}'`)
    }
    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const blob = await this.cacheUri(uri)
        return {
            mtime: blob.time,
            ctime: blob.time,
            size: blob.content.length,
            type: vscode.FileType.File,
        }
    }
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const blob = await this.cacheUri(uri)
        return blob.content
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

// interface StatParameters {}
// interface StatResult {}
interface RevisionParameters {
    repository: string
    revision: string
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
query Revision($repository: String!, $revision: String!) {
  repositoryRedirect(name: $repository) {
    ... on Repository {
      mirrorInfo {
        cloneInProgress
        cloneProgress
        cloned
      }
      commit(rev: $revision) {
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

export interface Blob {
    path: string
    content: Uint8Array
    time: number
}
