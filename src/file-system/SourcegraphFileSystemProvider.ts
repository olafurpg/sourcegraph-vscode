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
            const parsed = SourcegraphUri.parse(repository)
            promises.push({
                repositoryUri: repository,
                repositoryLabel: `${parsed.repository}${parsed.revisionString()}`,
                fileNames,
            })
        }
        return promises
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
                const parent = SourcegraphUri.parse(uri).parent()
                if (parent && !this.isExpandedNode.has(parent)) {
                    await this.didFocusString(parent, false)
                }
                // log.appendLine(`FOCUS: uri=${uri} isDestinationNode=${isDestinationNode}`)
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
    private async treeItemLabel(parsed: SourcegraphUri): Promise<string> {
        if (parsed.path) {
            return this.filename(parsed.path)
        }
        const metadata = await this.repositoryMetadata(parsed.repository, emptyCancelationToken())
        let revision = parsed.revision
        // log.appendLine(
        //     `TREE_ITEM_LABEL ${parsed.revision} defaultOid=${metadata?.defaultOid} defaultBranch=${metadata?.defaultBranch}`
        // )
        if (metadata?.defaultBranch && (!revision || revision === metadata?.defaultOid)) {
            revision = metadata.defaultBranch
        }
        return `${parsed.repository}@${revision}`
    }

    public async getTreeItem(uri: string): Promise<vscode.TreeItem> {
        try {
            // log.appendLine(`getTreeItem ${id} blob.type=${vscode.FileType[blob.type]} command=${JSON.stringify(command)}`)
            const parsed = SourcegraphUri.parse(uri)
            const label = await this.treeItemLabel(parsed)
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
        const parent = SourcegraphUri.parse(uri).parent()
        if (isDirectory && parent) {
            const parsedParent = SourcegraphUri.parse(parent)
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
    private async getFileTree(parsed: SourcegraphUri): Promise<FileTree | undefined> {
        if (!parsed.revision) {
            parsed.revision = this.metadata.get(parsed.repository)?.defaultBranch
        }
        const downloadingKey = parsed.repositoryString()
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
        return new FileTree(parsed, files)
    }
    public async getChildren(uri?: string): Promise<string[] | undefined> {
        try {
            if (!uri) {
                const repos = [...this.repos]
                return Promise.resolve(repos.map(repo => repo.replace('https://', 'sourcegraph://')))
            }
            const parsed = SourcegraphUri.parse(uri)
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
        return SourcegraphUri.parse(uri).parent()
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
                const parsed = SourcegraphUri.parse(repo)
                const revision = parsed.revision ? `@${parsed.revision}` : ''
                return `repo:^${parsed.repository}$${revision}`
            })
            .join(' OR ')
        const query = `(${repos}) AND ${document.getText()}`
        log.appendLine(`QUERY ${query}`)
        return await search('sourcegraph.com', query, SearchPatternType.literal, token)
    }

    public async provideReferences(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.ReferenceContext,
        token: vscode.CancellationToken
    ): Promise<vscode.Location[] | undefined> {
        if (document.languageId === 'sourcegraph') return this.searchReferences(document, token)
        const blob = await this.fetchBlob(document.uri.toString(true))
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
        const blob = await this.fetchBlob(document.uri.toString(true))
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
                `sourcegraph://sourcegraph.com/${node.resource.repository.name}@${revision}/-/blob/${node.resource.path}`
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
            const blob = await this.fetchBlob(uri.toString(true))
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
    public async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        log.appendLine(`READ_FILE ${uri.toString(true)}`)
        const blob = await this.fetchBlob(uri.toString(true))
        return blob.content
    }
    public async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        if (uri.toString(true).endsWith('/-')) return Promise.resolve([])
        log.appendLine(`READ_DIRECTORY ${uri.toString(true)}`)
        // try {
        //     await this.fetchBlob(uri.toString(true))
        // } catch (error) {
        //     log.appendLine(`ERROR readDirectory.fetchBlob(${uri.toString(true)})`)
        // }

        const parsed = SourcegraphUri.parse(uri.toString(true))
        log.appendLine(`READ_DIRECTORY parsed.path=${parsed.path}`)
        if (typeof parsed.path === 'undefined') {
            parsed.path = ''
        }
        const tree = await this.getFileTree(parsed)
        if (!tree) {
            return []
        }
        const children = tree.directChildren(parsed.path)
        log.appendLine(`result=${children.join('\n')}`)
        return children.map(child => {
            const isDirectory = child.includes('/-/tree/')
            const type = isDirectory ? vscode.FileType.Directory : vscode.FileType.File
            const name = this.filename(child)
            return [name, type]
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

    public async defaultFileUri(repository: string): Promise<string> {
        const token = new vscode.CancellationTokenSource()
        const revision = (await this.repositoryMetadata(repository, token.token))?.defaultBranch
        if (!revision) {
            log.appendLine(`ERROR defaultFileUri no revision ${repository}`)
            throw new Error(`ERROR defaultFileUri no revision ${repository}`)
        }
        const uri = `sourcegraph://sourcegraph.com/${repository}@${revision}`
        const files = await this.downloadFiles(SourcegraphUri.parse(uri), revision)
        const readmes = files.filter(name => name.match(/readme/i))
        const candidates = readmes.length > 0 ? readmes : files
        let readme: string | undefined
        log.appendLine(`CANDIDATES: ${JSON.stringify(files)} ${JSON.stringify(readmes)}`)
        for (const candidate of candidates) {
            log.appendLine(`CANDIDATE: ${JSON.stringify(candidate)}`)
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
        return `sourcegraph://sourcegraph.com/${repository}@${revision}/-/blob/${defaultFile}`
    }
    private async fetchBlob(uri: string): Promise<Blob> {
        const result = this.cache.get(uri)
        if (result) {
            return result
        }
        const parsed = SourcegraphUri.parse(uri)
        await this.repositoryMetadata(parsed.repository)
        const token = new vscode.CancellationTokenSource()
        if (!parsed.revision) {
            parsed.revision = (await this.repositoryMetadata(parsed.repository, token.token))?.defaultBranch
        }
        if (!parsed.revision) {
            throw new Error(`no parsed.revision from uri ${uri.toString()}`)
        }
        if (typeof parsed.path === 'undefined') {
            parsed.path = ''
        }
        const content = await contentQuery(
            {
                repository: parsed.repository,
                revision: parsed.revision,
                path: parsed.path,
            },
            token.token
        )
        this.downloadFiles(parsed, parsed.revision)
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
        const repo = SourcegraphUri.parse(blob.uri).repositoryString()
        this.cache.set(blob.uri, blob)
        const isNew = !this.repos.has(repo)
        if (isNew) {
            this.repos.add(repo)
            this.uriEmitter.fire(undefined)
            this.repoEmitter.fire(repo)
        }
    }

    private filename(path: string): string {
        const parts = path.split('/')
        return parts[parts.length - 1]
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

    downloadFiles(parsed: SourcegraphUri, revision: string): Promise<string[]> {
        const key = parsed.repositoryString()
        let downloadingFiles = this.files.get(key)
        if (!downloadingFiles) {
            downloadingFiles = filesQuery(
                { repository: parsed.repository, revision },
                new vscode.CancellationTokenSource().token
            )
            this.files.set(key, downloadingFiles)
        }
        return downloadingFiles
    }
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
