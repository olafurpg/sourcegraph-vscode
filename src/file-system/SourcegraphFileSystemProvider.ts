/* eslint-disable @typescript-eslint/no-unused-vars */
import * as vscode from 'vscode'
import SourcegraphUri from './SourcegraphUri'
import { searchQuery } from '../queries/searchQuery'
import log from '../log'
import { FileTree } from './FileTree'
import { SearchPatternType } from '../highlighting/scanner'
import filesQuery from '../queries/filesQuery'
import definitionQuery from '../queries/definitionQuery'
import LocationNode from '../queries/LocationNode'
import repositoryMetadataQuery, { RepositoryMetadata } from '../queries/repositoryMetadataQuery'
import contents from '../queries/contentQuery'
import hoverQuery from '../queries/hoverQuery'
import referencesQuery from '../queries/referencesQuery'

export const SRC_ENDPOINT_HOST = 'sourcegraph.com'

export interface RepositoryFileNames {
    repositoryUri: string
    repositoryName: string
    fileNames: string[]
}

export default class SourcegraphFileSystemProvider
    implements
        vscode.TreeDataProvider<string>,
        vscode.FileSystemProvider,
        vscode.HoverProvider,
        vscode.DefinitionProvider,
        vscode.ReferenceProvider
{
    private isTreeViewVisible: boolean = false
    private isExpandedNode = new Set<string>()
    private treeView: vscode.TreeView<string> | undefined
    private activeUri: vscode.Uri | undefined
    private fileNamesByRepository: Map<string, Promise<string[]>> = new Map()
    private metadata: Map<string, RepositoryMetadata> = new Map()
    private readonly cache = new Map<string, Blob>()
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

    public async allFileFromOpenRepositories(): Promise<RepositoryFileNames[]> {
        const promises: RepositoryFileNames[] = []
        for (const [repositoryUri, downloadingFileNames] of this.fileNamesByRepository.entries()) {
            try {
                const fileNames = await downloadingFileNames
                const uri = SourcegraphUri.parse(repositoryUri)
                promises.push({
                    repositoryUri: uri.repositoryUri(),
                    repositoryName: `${uri.repositoryName}${uri.revisionPath()}`,
                    fileNames,
                })
            } catch (_error) {
                log.appendLine(`ERROR: failed to download repo files ${repositoryUri}`)
            }
        }
        return promises
    }
    public async focusActiveFile(): Promise<void> {
        await vscode.commands.executeCommand('sourcegraph.files.focus')
        await this.didFocus(this.activeUri)
    }
    public async didFocus(uri: vscode.Uri | undefined): Promise<void> {
        this.activeUri = uri
        if (uri && uri.scheme === 'sourcegraph' && this.treeView && this.isTreeViewVisible) {
            await this.didFocusString(sourcegraphUri(uri), true)
        }
    }
    private async didFocusString(uri: SourcegraphUri, isDestinationNode: boolean): Promise<void> {
        try {
            if (this.treeView) {
                const parent = uri.parentUri()
                if (parent && !this.isExpandedNode.has(parent)) {
                    await this.didFocusString(SourcegraphUri.parse(parent), false)
                }
                await this.treeView.reveal(uri.uri, {
                    focus: true,
                    select: isDestinationNode,
                    expand: !isDestinationNode,
                })
            }
        } catch (error) {
            log.appendLine(`ERROR: didFocusString(${uri.uri}) error=${error}`)
        }
    }
    private async treeItemLabel(uri: SourcegraphUri): Promise<string> {
        if (uri.path) {
            return uri.basename()
        }
        const metadata = await this.repositoryMetadata(uri.repositoryName, emptyCancelationToken())
        let revision = uri.revision
        if (metadata?.defaultBranch && (!revision || revision === metadata?.defaultOid)) {
            revision = metadata.defaultBranch
        }
        return `${uri.repositoryName}@${revision}`
    }

    public async getTreeItem(uriString: string): Promise<vscode.TreeItem> {
        const uri = SourcegraphUri.parse(uriString)
        try {
            const label = await this.treeItemLabel(uri)
            const isFile = uri.uri.includes('/-/blob/')
            const isDirectory = !isFile
            const collapsibleState = await this.getCollapsibleState(uri, isDirectory)
            const command = isFile
                ? {
                      command: 'extension.openFile',
                      title: 'Open file',
                      arguments: [uri.uri],
                  }
                : undefined
            return {
                id: uri.uri,
                label,
                tooltip: uri.uri.replace('sourcegraph://', 'https://'),
                collapsibleState,
                command,
                resourceUri: vscode.Uri.parse(uri.uri),
            }
        } catch (error) {
            log.appendLine(`ERROR: getTreeItem(${uri.uri}) error=${error}`)
            return Promise.resolve({})
        }
    }
    private async getCollapsibleState(
        uri: SourcegraphUri,
        isDirectory: boolean
    ): Promise<vscode.TreeItemCollapsibleState> {
        const parent = uri.parentUri()
        if (isDirectory && parent) {
            const parentUri = SourcegraphUri.parse(parent)
            if (parentUri.path) {
                const tree = await this.getFileTree(parentUri)
                const directChildren = tree?.directChildren(parentUri.path)
                if (directChildren && directChildren.length === 1) {
                    return vscode.TreeItemCollapsibleState.Expanded
                }
            }
        }
        return isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }
    private async getFileTree(uri: SourcegraphUri): Promise<FileTree | undefined> {
        if (!uri.revision) {
            uri = uri.withRevision(this.metadata.get(uri.repositoryName)?.defaultBranch)
        }
        const key = uri.repositoryUri()
        const downloading = this.fileNamesByRepository.get(key)
        if (!downloading) {
            const keys = JSON.stringify([...this.fileNamesByRepository.keys()])
            log.error(`getFileTree(${uri.uri}) - empty downloading key=${key} keys=${keys}`)
            return Promise.resolve(undefined)
        }
        const files = await downloading
        if (!files) {
            log.error(`getFileTree - empty files`)
            return Promise.resolve(undefined)
        }
        // log.appendLine(`new FileTree(${JSON.stringify(files)})`)
        return new FileTree(uri, files)
    }
    public async getChildren(uriString?: string): Promise<string[] | undefined> {
        try {
            if (!uriString) {
                const repos = [...this.fileNamesByRepository.keys()]
                return Promise.resolve(repos.map(repo => repo.replace('https://', 'sourcegraph://')))
            }
            const uri = SourcegraphUri.parse(uriString)
            const tree = await this.getFileTree(uri)
            const result = tree?.directChildren(uri.path || '')
            // log.appendLine(`getChildren(${uri}) path=${parsed.path} tree=${tree} result=${JSON.stringify(result)}`)
            return result
        } catch (error) {
            log.appendLine(`ERROR: getChildren(${uriString}) error=${error}`)
            return Promise.resolve(undefined)
        }
    }
    public getParent(uriString: string): string | undefined {
        return SourcegraphUri.parse(uriString).parentUri()
    }
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event

    private async searchReferences(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const repos = [...this.fileNamesByRepository.keys()]
            .map(repo => {
                const uri = SourcegraphUri.parse(repo)
                return `repo:^${uri.repositoryName}$${uri.revisionPath()}`
            })
            .join(' OR ')
        const query = `(${repos}) AND ${document.getText()}`
        return await searchQuery(SRC_ENDPOINT_HOST, query, SearchPatternType.literal, token)
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        if (document.languageId === 'sourcegraph') return this.searchReferences(document, token)
        const uri = sourcegraphUri(document.uri)
        const blob = await this.fetchBlob(uri)
        const locationNodes = await referencesQuery(
            {
                repositoryName: blob.repositoryName,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return locationNodes.map(node => this.nodeToLocation(node))
    }

    public async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken
    ): Promise<vscode.Definition | undefined> {
        const uri = sourcegraphUri(document.uri)
        const blob = await this.fetchBlob(uri)
        const locations = await definitionQuery(
            {
                repositoryName: blob.repositoryName,
                revision: blob.revision,
                path: blob.path,
                line: position.line,
                character: position.character,
            },
            token
        )
        return locations.map(node => this.nodeToLocation(node))
    }

    private nodeToLocation(node: LocationNode): vscode.Location {
        const metadata = this.metadata.get(node.resource.repository.name)
        let revision = node.resource.commit.oid
        if (metadata?.defaultBranch && revision === metadata?.defaultOid) {
            revision = metadata.defaultBranch
        }
        return new vscode.Location(
            vscode.Uri.parse(
                SourcegraphUri.fromParts(SRC_ENDPOINT_HOST, node.resource.repository.name, revision, node.resource.path)
                    .uri
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
        const blob = await this.fetchBlob(sourcegraphUri(document.uri))
        const hover = await hoverQuery(
            {
                repositoryName: blob.repositoryName,
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
            contents: [new vscode.MarkdownString(hover)],
        }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        try {
            const blob = await this.fetchBlob(sourcegraphUri(uri))
            return {
                mtime: blob.time,
                ctime: blob.time,
                size: blob.byteSize,
                type: blob.type,
            }
        } catch (error) {
            const time = new Date().getMilliseconds()
            return {
                mtime: time,
                ctime: time,
                size: 0,
                type: vscode.FileType.Directory,
            }
        }
    }

    public async readFile(vscodeUri: vscode.Uri): Promise<Uint8Array> {
        const uri = sourcegraphUri(vscodeUri)
        return (await this.fetchBlob(uri)).content
    }

    public async readDirectory(vscodeUri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const uri = sourcegraphUri(vscodeUri)
        if (uri.uri.endsWith('/-')) return Promise.resolve([])
        const tree = await this.getFileTree(uri)
        if (!tree) {
            return []
        }
        const children = tree.directChildren(uri.path || '')
        return children.map(childUri => {
            const child = SourcegraphUri.parse(childUri)
            const type = child.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File
            return [child.basename(), type]
        })
    }

    public createDirectory(uri: vscode.Uri): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public writeFile(
        _uri: vscode.Uri,
        _content: Uint8Array,
        _options: { create: boolean; overwrite: boolean }
    ): void | Thenable<void> {
        throw new Error('Method not supported in read-only file system.')
    }
    public delete(_uri: vscode.Uri, _options: { recursive: boolean }): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public rename(_oldUri: vscode.Uri, _newUri: vscode.Uri, _options: { overwrite: boolean }): void {
        throw new Error('Method not supported in read-only file system.')
    }
    public watch(_uri: vscode.Uri, _options: { recursive: boolean; excludes: string[] }): vscode.Disposable {
        throw new Error('Method not supported in read-only file system.')
    }

    public async defaultFileUri(repository: string): Promise<SourcegraphUri> {
        const token = emptyCancelationToken()
        const defaultBranch = (await this.repositoryMetadata(repository, token))?.defaultBranch
        if (!defaultBranch) {
            const message = `ERROR defaultBranch no repository '${repository}'`
            log.appendLine(message)
            throw new Error(message)
        }
        const uri = SourcegraphUri.fromParts(SRC_ENDPOINT_HOST, repository, defaultBranch, undefined)
        const files = await this.downloadFiles(uri, defaultBranch)
        const readmes = files.filter(name => name.match(/readme/i))
        const candidates = readmes.length > 0 ? readmes : files
        let readme: string | undefined
        for (const candidate of candidates) {
            if (candidate === '' || candidate === 'lsif-java.json') {
                // Skip auto-generated file for JVM packages
                continue
            }
            if (!readme) {
                readme = candidate
            } else if (candidate.length < readme.length) {
                readme = candidate
            }
        }
        const defaultFile = readme ? readme : files[0]
        return SourcegraphUri.fromParts(SRC_ENDPOINT_HOST, repository, defaultBranch, defaultFile)
    }

    private async fetchBlob(uri: SourcegraphUri): Promise<Blob> {
        const result = this.cache.get(uri.uri)
        if (result) {
            return result
        }
        await this.repositoryMetadata(uri.repositoryName)
        const token = emptyCancelationToken()
        const revision = uri.revision || (await this.repositoryMetadata(uri.repositoryName, token))?.defaultBranch
        if (!revision) {
            throw new Error(`no uri.revision from uri ${uri.uri}`)
        }
        const path = uri.path || ''
        const content = await contents(
            {
                repository: uri.repositoryName,
                revision: revision,
                path: path,
            },
            token
        )

        // Start downloading the files for this repository in the background.
        // this.downloadFiles(uri, revision)

        if (content) {
            const toCacheResult: Blob = {
                uri: uri.uri,
                repositoryName: uri.repositoryName,
                revision: revision,
                content: content.content,
                isBinaryFile: content.isBinary,
                byteSize: content.byteSize,
                path: path,
                time: new Date().getMilliseconds(),
                type: vscode.FileType.File,
            }
            this.updateCache(toCacheResult)
            return toCacheResult
        }
        log.error(`fetchBlob(${uri.uri}) not found`)
        throw new Error(`Not found '${uri.uri}'`)
    }

    private updateCache(blob: Blob) {
        const uri = SourcegraphUri.parse(blob.uri)
        const repo = uri.repositoryUri()
        this.cache.set(blob.uri, blob)
        const isNew = !this.fileNamesByRepository.has(repo)
        if (isNew) {
            this.downloadFiles(uri, blob.revision)
            this.uriEmitter.fire(undefined)
        }
    }

    public async repositoryMetadata(
        repository: string,
        token?: vscode.CancellationToken
    ): Promise<RepositoryMetadata | undefined> {
        let metadata = this.metadata.get(repository)
        if (metadata) return metadata
        metadata = await repositoryMetadataQuery(
            {
                repository: repository,
            },
            token || emptyCancelationToken()
        )
        this.metadata.set(repository, metadata)
        return metadata
    }

    private downloadFiles(uri: SourcegraphUri, revision: string): Promise<string[]> {
        const key = uri.repositoryUri()
        let downloadingFiles = this.fileNamesByRepository.get(key)
        if (!downloadingFiles) {
            downloadingFiles = filesQuery({ repository: uri.repositoryName, revision }, emptyCancelationToken())
            this.fileNamesByRepository.set(key, downloadingFiles)
        }
        return downloadingFiles
    }
}

function sourcegraphUri(uri: vscode.Uri): SourcegraphUri {
    return SourcegraphUri.parse(uri.toString(true))
}

interface Blob {
    uri: string
    repositoryName: string
    revision: string
    path: string
    content: Uint8Array
    isBinaryFile: boolean
    byteSize: number
    time: number
    type: vscode.FileType
}

function emptyCancelationToken(): vscode.CancellationToken {
    return new vscode.CancellationTokenSource().token
}
