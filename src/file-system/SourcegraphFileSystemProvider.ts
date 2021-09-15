/* eslint-disable @typescript-eslint/no-unused-vars */
import { TextEncoder } from 'util'
import * as vscode from 'vscode'
import { SourcegraphUri } from './SourcegraphUri'
import { search } from '../queries/graphqlQuery'
import { log } from '../log'
import { FileTree } from './FileTree'
import { SearchPatternType } from '../highlighting/scanner'
import { filesQuery } from '../queries/filesQuery'
import { definitionQuery } from '../queries/definitionQuery'
import { LocationNode } from '../queries/LocationNode'
import { repositoryMetadataQuery, RepositoryMetadata } from '../queries/repositoryMetadataQuery'
import { contentQuery } from '../queries/contentQuery'
import { hoverQuery } from '../queries/hoverQuery'
import { referencesQuery } from '../queries/referencesQuery'

const SRC_ENDPOINT_HOST = 'sourcegraph.com'

export class SourcegraphFileSystemProvider
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
    private files: Map<string, Promise<string[]>> = new Map()
    private metadata: Map<string, RepositoryMetadata> = new Map()

    private readonly uriEmitter = new vscode.EventEmitter<string | undefined>()
    private readonly repoEmitter = new vscode.EventEmitter<string>()

    public onNewRepo = this.repoEmitter.event
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

    public async allFileFromOpenRepositories(): Promise<RepositoryFile[]> {
        const promises: RepositoryFile[] = []
        for (const [repository, downloadingFileNames] of this.files.entries()) {
            const fileNames = await downloadingFileNames
            const uri = SourcegraphUri.parse(repository)
            promises.push({
                repositoryUri: repository,
                repositoryLabel: `${uri.repository}${uri.revisionPath()}`,
                fileNames,
            })
        }
        return promises
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
                const parent = uri.parent()
                if (parent && !this.isExpandedNode.has(parent)) {
                    await this.didFocusString(SourcegraphUri.parse(parent), false)
                }
                // log.appendLine(`FOCUS: uri=${uri} isDestinationNode=${isDestinationNode}`)
                await this.treeView.reveal(uri.uri, {
                    focus: true,
                    select: isDestinationNode,
                    expand: !isDestinationNode,
                })
            }
        } catch (error) {
            log.appendLine(`ERROR: didFocusString(${uri}) error=${error}`)
        }
    }
    private async treeItemLabel(uri: SourcegraphUri): Promise<string> {
        if (uri.path) {
            return filename(uri.path)
        }
        const metadata = await this.repositoryMetadata(uri.repository, emptyCancelationToken())
        let revision = uri.revision
        // log.appendLine(
        //     `TREE_ITEM_LABEL ${uri.revision} defaultOid=${metadata?.defaultOid} defaultBranch=${metadata?.defaultBranch}`
        // )
        if (metadata?.defaultBranch && (!revision || revision === metadata?.defaultOid)) {
            revision = metadata.defaultBranch
        }
        return `${uri.repository}@${revision}`
    }

    public async getTreeItem(uriString: string): Promise<vscode.TreeItem> {
        const uri = SourcegraphUri.parse(uriString)
        try {
            // log.appendLine(`getTreeItem ${id} blob.type=${vscode.FileType[blob.type]} command=${JSON.stringify(command)}`)
            const label = await this.treeItemLabel(uri)
            const isFile = uri.uri.includes('/-/blob/')
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
        const parent = uri.parent()
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
            uri = uri.withRevision(this.metadata.get(uri.repository)?.defaultBranch)
        }
        const downloadingKey = uri.repositoryUri()
        const downloading = this.files.get(downloadingKey)
        if (!downloading) {
            log.appendLine(
                `getFileTree - empty downloading key=${downloadingKey} keys=${JSON.stringify([...this.files.keys()])}`
            )
            return Promise.resolve(undefined)
        }
        const files = await downloading
        if (!files) {
            log.appendLine(`getFileTree - empty files`)
            return Promise.resolve(undefined)
        }
        // log.appendLine(`new FileTree(${JSON.stringify(files)})`)
        return new FileTree(uri, files)
    }
    public async getChildren(uriString?: string): Promise<string[] | undefined> {
        try {
            if (!uriString) {
                const repos = [...this.repos]
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
        return SourcegraphUri.parse(uriString).parent()
    }
    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
    public readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event
    private readonly cache = new Map<string, Blob>()
    private readonly repos = new Set<string>()

    private async searchReferences(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[]> {
        const repos = [...this.repos]
            .map(repo => {
                const uri = SourcegraphUri.parse(repo)
                return `repo:^${uri.repository}$${uri.revisionPath()}`
            })
            .join(' OR ')
        const query = `(${repos}) AND ${document.getText()}`
        log.appendLine(`QUERY ${query}`)
        return await search(SRC_ENDPOINT_HOST, query, SearchPatternType.literal, token)
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
                repository: blob.repository,
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
                repository: blob.repository,
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
        } else {
            log.appendLine(
                `NODE_TO_LOCATION oid=${node.resource.commit.oid} defaultOid=${metadata?.defaultOid} defaultBranch=${metadata?.defaultBranch}`
            )
        }
        return new vscode.Location(
            vscode.Uri.parse(
                `sourcegraph://${SRC_ENDPOINT_HOST}/${node.resource.repository.name}@${revision}/-/blob/${node.resource.path}`
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
            contents: [new vscode.MarkdownString(hover)],
        }
    }

    public async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        log.appendLine(`STAT: ${uri.toString(true)}`)
        try {
            const blob = await this.fetchBlob(sourcegraphUri(uri))
            return {
                mtime: blob.time,
                ctime: blob.time,
                size: blob.content.length,
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
        log.appendLine(`READ_FILE ${uri.uri}`)
        return (await this.fetchBlob(uri)).content
    }

    public async readDirectory(vscodeUri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        const uri = sourcegraphUri(vscodeUri)
        if (uri.uri.endsWith('/-')) return Promise.resolve([])
        log.appendLine(`READ_DIRECTORY uri.path=${uri.path}`)
        const tree = await this.getFileTree(uri)
        if (!tree) {
            return []
        }
        const children = tree.directChildren(uri.path || '')
        return children.map(child => {
            const isDirectory = child.includes('/-/tree/')
            const type = isDirectory ? vscode.FileType.Directory : vscode.FileType.File
            const name = filename(child)
            return [name, type]
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
        const token = new vscode.CancellationTokenSource()
        const defaultBranch = (await this.repositoryMetadata(repository, token.token))?.defaultBranch
        if (!defaultBranch) {
            log.appendLine(`ERROR defaultFileUri no revision ${repository}`)
            throw new Error(`ERROR defaultFileUri no revision ${repository}`)
        }
        const uri = `sourcegraph://${SRC_ENDPOINT_HOST}/${repository}@${defaultBranch}`
        const files = await this.downloadFiles(SourcegraphUri.parse(uri), defaultBranch)
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
        return SourcegraphUri.parse(
            `sourcegraph://${SRC_ENDPOINT_HOST}/${repository}@${defaultBranch}/-/blob/${defaultFile}`
        )
    }

    private async fetchBlob(uri: SourcegraphUri): Promise<Blob> {
        const result = this.cache.get(uri.uri)
        if (result) {
            return result
        }
        await this.repositoryMetadata(uri.repository)
        const token = new vscode.CancellationTokenSource()
        const revision = uri.revision || (await this.repositoryMetadata(uri.repository, token.token))?.defaultBranch
        if (!revision) {
            throw new Error(`no uri.revision from uri ${uri.uri}`)
        }
        const path = uri.path || ''
        const content = await contentQuery(
            {
                repository: uri.repository,
                revision: revision,
                path: path,
            },
            token.token
        )
        this.downloadFiles(uri, revision)
        if (content) {
            const encoder = new TextEncoder()
            const toCacheResult: Blob = {
                uri: uri.uri,
                repository: uri.repository,
                revision: revision,
                content: encoder.encode(content),
                path: path,
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
        const repo = SourcegraphUri.parse(blob.uri).repositoryUri()
        this.cache.set(blob.uri, blob)
        const isNew = !this.repos.has(repo)
        if (isNew) {
            this.repos.add(repo)
            this.uriEmitter.fire(undefined)
            this.repoEmitter.fire(repo)
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
        let downloadingFiles = this.files.get(key)
        if (!downloadingFiles) {
            downloadingFiles = filesQuery(
                { repository: uri.repository, revision },
                new vscode.CancellationTokenSource().token
            )
            this.files.set(key, downloadingFiles)
        }
        return downloadingFiles
    }
}

function sourcegraphUri(uri: vscode.Uri): SourcegraphUri {
    return SourcegraphUri.parse(uri.toString(true))
}

export interface RepositoryFile {
    repositoryUri: string
    repositoryLabel: string
    fileNames: string[]
}

interface Blob {
    uri: string
    repository: string
    revision: string
    path: string
    content: Uint8Array
    time: number
    type: vscode.FileType
}

function emptyCancelationToken(): vscode.CancellationToken {
    return new vscode.CancellationTokenSource().token
}

function filename(path: string): string {
    const parts = path.split('/')
    return parts[parts.length - 1]
}
