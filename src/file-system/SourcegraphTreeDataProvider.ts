import * as vscode from 'vscode'
import log from '../log'
import SourcegraphFileSystemProvider from './SourcegraphFileSystemProvider'
import { emptyCancelationToken } from './emptyCancelationToken'
import SourcegraphUri from './SourcegraphUri'

export default class SourcegraphTreeDataProvider implements vscode.TreeDataProvider<string> {
    constructor(private readonly fs: SourcegraphFileSystemProvider) {
        fs.onDidDownloadRepositoryFilenames(() => this.didChangeTreeData.fire(undefined))
    }

    private isTreeViewVisible: boolean = false
    private isExpandedNode = new Set<string>()
    private treeView: vscode.TreeView<string> | undefined
    private activeUri: vscode.Uri | undefined
    private readonly didChangeTreeData = new vscode.EventEmitter<string | undefined>()
    public readonly onDidChangeTreeData: vscode.Event<string | undefined> = this.didChangeTreeData.event

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

    public getParent(uriString?: string): string | undefined {
        if (!uriString) {
            return undefined
        }
        return SourcegraphUri.parse(uriString).parentUri()
    }

    public async getChildren(uriString?: string): Promise<string[] | undefined> {
        try {
            if (!uriString) {
                const repos = [...this.fs.allRepositoryUris()]
                return Promise.resolve(repos.map(repo => repo.replace('https://', 'sourcegraph://')))
            }
            const uri = SourcegraphUri.parse(uriString)
            const tree = await this.fs.getFileTree(uri)
            const result = tree?.directChildren(uri.path || '')
            return result
        } catch (error) {
            log.error(`getChildren(${uriString})`, error)
            return Promise.resolve(undefined)
        }
    }

    public async focusActiveFile(): Promise<void> {
        await vscode.commands.executeCommand('sourcegraph.files.focus')
        await this.didFocus(this.activeUri)
    }

    public async didFocus(vscodeUri: vscode.Uri | undefined): Promise<void> {
        this.activeUri = vscodeUri
        if (vscodeUri && vscodeUri.scheme === 'sourcegraph' && this.treeView && this.isTreeViewVisible) {
            const uri = this.fs.sourcegraphUri(vscodeUri)
            await this.fs.downloadFiles(uri, uri.revision || '')
            await this.didFocusString(uri, true)
        }
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
            log.error(`getTreeItem(${uri.uri})`, error)
            return Promise.resolve({})
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
            log.error(`didFocusString(${uri.uri})`, error)
        }
    }

    private async treeItemLabel(uri: SourcegraphUri): Promise<string> {
        if (uri.path) {
            return uri.basename()
        }
        const metadata = await this.fs.repositoryMetadata(uri.repositoryName, emptyCancelationToken())
        let revision = uri.revision
        if (metadata?.defaultBranch && (!revision || revision === metadata?.defaultOid)) {
            revision = metadata.defaultBranch
        }
        return `${uri.repositoryName}@${revision}`
    }

    private async getCollapsibleState(
        uri: SourcegraphUri,
        isDirectory: boolean
    ): Promise<vscode.TreeItemCollapsibleState> {
        const parent = uri.parentUri()
        if (isDirectory && parent) {
            const parentUri = SourcegraphUri.parse(parent)
            if (parentUri.path) {
                const tree = await this.fs.getFileTree(parentUri)
                const directChildren = tree?.directChildren(parentUri.path)
                if (directChildren && directChildren.length === 1) {
                    return vscode.TreeItemCollapsibleState.Expanded
                }
            }
        }
        return isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
    }
}
