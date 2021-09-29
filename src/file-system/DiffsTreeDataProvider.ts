import * as vscode from 'vscode'
import { log } from '../log'
import {
    repositoryComparisonDiffQuery,
    RepositoryComparisonNode,
    RepositoryComparisonParameters,
} from '../queries/repositoryComparisonDiffQuery'
import { endpointHostnameSetting } from '../settings/endpointSetting'
import { emptyCancelationToken } from './emptyCancelationToken'
import { FileTree } from './FileTree'
import { SourcegraphFileSystemProvider } from './SourcegraphFileSystemProvider'
import { CompareRange, SourcegraphUri } from './SourcegraphUri'

type DiffNodeKind = 'base' | 'head' | 'commits' | 'files'
interface DiffNodeOptionals {
    kind?: DiffNodeKind
    commit?: string
    path?: string
}

export class DiffNode {
    private constructor(
        public readonly repositoryName: string,
        public readonly kind: DiffNodeKind | undefined,
        public readonly commit: string | undefined,
        public readonly path: string | undefined
    ) {}

    public isRepositoryName(): boolean {
        return !this.kind && !this.commit && !this.path
    }
    public static repositoryName(repositoryName: string, optionals?: DiffNodeOptionals): DiffNode {
        return DiffNode.fromAny({ repositoryName, ...optionals })
    }
    public with(optionals: DiffNodeOptionals): DiffNode {
        return DiffNode.repositoryName(this.repositoryName, {
            kind: this.kind,
            commit: this.commit,
            path: this.path,
            ...optionals,
        })
    }
    public static parse(json: string): DiffNode {
        try {
            return this.fromAny(JSON.parse(json))
        } catch (error) {
            log.error(`DiffUri.parse(json=${json})`, error)
            throw new Error(`DiffUri.parse(${json})`)
        }
    }
    private static fromAny(any: any): DiffNode {
        const repositoryName = any?.repositoryName
        if (typeof repositoryName != 'string') {
            throw new Error(`DiffUri.fromAny() missing repositoryName`)
        }
        let kind: DiffNodeKind | undefined
        if (any?.kind === 'base' || any?.kind === 'head' || any?.kind === 'commits' || any?.kind === 'files') {
            kind = any.kind
        }
        let commit: string | undefined
        if (typeof any?.commit === 'string') {
            commit = any.commit
        }
        let path: string | undefined
        if (typeof any?.path === 'string') {
            path = any.path
        }
        return new DiffNode(repositoryName, kind, commit, path)
    }
    public toString(): string {
        return JSON.stringify(this)
    }
}
const first = DiffNode.repositoryName('A')
const second = DiffNode.repositoryName('B')

export class DiffsTreeDataProvider implements vscode.TreeDataProvider<string> {
    private compareRangeFileNamesCache = new Map<string, RepositoryComparisonNode[]>()
    private treeItemCache = new Map<string, vscode.TreeItem>()
    private compareRangesByRepositoryName = new Map<string, CompareRange>()
    private counter = 0
    private diffNodeChanges = new vscode.EventEmitter<string | undefined>()
    public onDidChangeTreeData?: vscode.Event<string | undefined> = this.diffNodeChanges.event
    constructor(public readonly fs: SourcegraphFileSystemProvider) {
        fs.onDidDownloadRepositoryFilenames(() => this.diffNodeChanges.fire(undefined))
    }
    private treeView: vscode.TreeView<string> | undefined
    public setTreeView(newTreeView: vscode.TreeView<string>): void {
        this.treeView = newTreeView
    }
    public async didFocus(vscodeUri: vscode.Uri | undefined): Promise<void> {
        if (vscodeUri && this.treeView) {
            this.counter++
            this.treeView.reveal(this.counter % 2 === 0 ? first.toString() : second.toString(), { select: true })
        }
        return Promise.resolve()
    }
    public getTreeItem(element: string): vscode.TreeItem {
        log.appendLine(`getTreeItem(${element})`)
        const node = DiffNode.parse(element)
        if (node.isRepositoryName()) {
            return { label: node.repositoryName, collapsibleState: vscode.TreeItemCollapsibleState.Expanded }
        }
        switch (node.kind) {
            case 'base':
                return { label: `base: ${this.compareRange(node).base}` }
            case 'head':
                return { label: `head: ${this.compareRange(node).head}` }
            case 'commits':
            case 'files':
                if (!node.path) {
                    return { label: node.kind, collapsibleState: vscode.TreeItemCollapsibleState.Expanded }
                }
                const fromCache = this.treeItemCache.get(node.toString())
                if (fromCache) {
                    return fromCache
                }
                return {}
            default:
                return {}
        }
    }
    public async getChildren(element?: string): Promise<string[]> {
        log.appendLine(`getChildren(${element})`)
        if (!element) {
            const repositoryNames = [
                ...new Set(this.fs.allRepositoryUris().map(uri => SourcegraphUri.parse(uri).repositoryName)),
            ]
            return repositoryNames.map(name => DiffNode.repositoryName(name).toString())
        }
        const node = DiffNode.parse(element)
        log.appendLine(`getChildren(${element}) isRepositoryName=${node.isRepositoryName()}`)
        if (node.isRepositoryName()) {
            return [
                node.with({ kind: 'base' }),
                node.with({ kind: 'head' }),
                node.with({ kind: 'commits' }),
                node.with({ kind: 'files' }),
            ].map(node => node.toString())
        }
        switch (node.kind) {
            case 'files':
                const { tree, nodes } = await this.compareRangeFileTree(node)
                const directChildren = tree.directChildren(node.path || '')
                const parent = SourcegraphUri.fromParts(endpointHostnameSetting(), node.repositoryName, {
                    revision: this.compareRange(node).head,
                    path: node.path,
                })
                const range = this.compareRange(node)
                const result: string[] = []
                // log.appendLine(`parent=${node.toString()} directChildren=${JSON.stringify(directChildren)}`)
                for (const child of directChildren) {
                    const uri = SourcegraphUri.parse(child)
                    const childNode = node.with({ path: uri.path })
                    const treeItem = this.newTreeItem(
                        uri,
                        childNode,
                        parent,
                        directChildren.length,
                        range,
                        this.oldPath(uri.path || '', nodes)
                    )
                    // log.appendLine(`uri=${uri.uri} treeItem=${JSON.stringify(treeItem)}`)
                    const childKey = childNode.toString()
                    this.treeItemCache.set(childKey, treeItem)
                    result.push(childKey)
                }
                return result
            case 'base':
            case 'head':
            case 'commits':
            default:
                return []
        }
    }
    public getParent(element: string): string | undefined {
        return undefined
    }

    private oldPath(newPath: string, nodes: RepositoryComparisonNode[]): string | undefined {
        for (const node of nodes) {
            if (newPath === node.newPath && node.oldPath) {
                return node.oldPath
            }
        }
        return
    }
    private async compareRangeFileTree(node: DiffNode): Promise<{ tree: FileTree; nodes: RepositoryComparisonNode[] }> {
        const nodes = await this.compareRangeFileNames(node)
        log.appendLine(`compareRangeFileNames${node.toString()}`)
        log.appendLine(` nodes=${JSON.stringify(nodes)}`)
        const filenames: string[] = []
        for (const node of nodes) {
            if (node.newPath) {
                filenames.push(node.newPath)
            }
        }
        return {
            nodes,
            tree: new FileTree(
                SourcegraphUri.parse(`sourcegraph://${endpointHostnameSetting()}/${node.repositoryName}`),
                filenames
            ),
        }
    }

    private async compareRangeFileNames(node: DiffNode): Promise<RepositoryComparisonNode[]> {
        const id = (await this.fs.repositoryMetadata(node.repositoryName))?.id
        if (!id) {
            return []
        }
        const parameters: RepositoryComparisonParameters = {
            repositoryId: id,
            first: 1000,
            ...this.compareRange(node),
        }
        const key = JSON.stringify(parameters)
        let nodes = this.compareRangeFileNamesCache.get(key)
        if (!nodes) {
            nodes = await repositoryComparisonDiffQuery(parameters, emptyCancelationToken())
            this.compareRangeFileNamesCache.set(key, nodes)
        }
        return nodes
    }

    private compareRange(node: DiffNode): CompareRange {
        let range = this.compareRangesByRepositoryName.get(node.repositoryName)
        if (!range) {
            range = {
                base: 'HEAD~1',
                head: 'HEAD',
            }
            this.compareRangesByRepositoryName.set(node.repositoryName, range)
        }
        return range
    }

    private newTreeItem(
        uri: SourcegraphUri,
        childNode: DiffNode,
        parent: SourcegraphUri | undefined,
        parentChildrenCount: number,
        range: CompareRange,
        oldPath: string | undefined
    ): vscode.TreeItem {
        const command =
            uri.isFile() && oldPath
                ? {
                      command: 'vscode.diff',
                      title: 'Compare files',
                      arguments: [
                          vscode.Uri.parse(uri.withRevision(range.base).withPath(oldPath).uri),
                          vscode.Uri.parse(uri.withRevision(range.head).uri),
                          `${uri.basename()} (${range.base}...${range.head})`,
                      ],
                  }
                : undefined
        const label = uri.treeItemLabel(parent)

        return {
            id: childNode.toString(),
            label,
            tooltip: uri.uri.replace('sourcegraph://', 'https://'),
            collapsibleState: uri.isFile()
                ? vscode.TreeItemCollapsibleState.None
                : parentChildrenCount === 1
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed,
            command,
            resourceUri: vscode.Uri.parse(uri.uri),
            contextValue: uri.isFile() ? 'file' : 'directory',
        }
    }
}
