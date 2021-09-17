import * as vscode from 'vscode'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import SourcegraphUri from '../file-system/SourcegraphUri'

export interface NewQuickPickValue {
    text: string
    token: vscode.CancellationToken
}

export interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
    unresolvedRepositoryName?: string
}

export class SourcegraphQuickPick {
    private recentlyBrowsedItems: BrowseQuickPickItem[] = []
    private valueEmitter = new vscode.EventEmitter<NewQuickPickValue>()
    public readonly pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
    public onDidChangeValue: vscode.Event<NewQuickPickValue> = this.valueEmitter.event

    constructor(private readonly fs: SourcegraphFileSystemProvider) {}

    public async showQuickPickAndGetUserInput(): Promise<SourcegraphUri> {
        return new Promise((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            this.pick.ignoreFocusOut = true
            this.pick.matchOnDescription = true
            this.pick.matchOnDetail = true
            this.pick.items = this.recentlyBrowsedItems
            let pendingRequests: vscode.CancellationTokenSource = new vscode.CancellationTokenSource()
            const onCancelableDidChangeValue = async (value: string) => {
                if (pendingRequests) {
                    pendingRequests.cancel()
                    pendingRequests.dispose()
                    pendingRequests = new vscode.CancellationTokenSource()
                }
                this.valueEmitter.fire({
                    text: value,
                    token: pendingRequests.token,
                })
            }
            onCancelableDidChangeValue(this.pick.value)
            this.pick.onDidChangeValue(onCancelableDidChangeValue)
            this.pick.onDidChangeSelection(items => {
                if (items.length > 0) {
                    selection = items[items.length - 1]
                }
            })
            this.pick.onDidAccept(async () => {
                if (!selection) {
                    log.appendLine(`onDidAccept - selection is empty`)
                    return
                }
                this.pick.busy = true
                try {
                    const uri = await this.resolveFileUri(selection)
                    resolve(uri)
                    this.pick.dispose()
                } catch (error) {
                    this.pick.busy = false
                    log.appendLine(`ERROR onDidAccept error=${error} selection=${JSON.stringify(selection)}`)
                }
            })
            this.pick.onDidHide(() => {
                this.pick.dispose()
                reject()
            })
            this.pick.show()
        })
    }

    private async resolveFileUri(selection: BrowseQuickPickItem): Promise<SourcegraphUri> {
        let uriString = selection.uri
        if (selection.unresolvedRepositoryName) {
            // Update the missing file path if it's missing
            if (!selection.uri || !SourcegraphUri.parse(selection.uri).path) {
                uriString = (await this.fs.defaultFileUri(selection.unresolvedRepositoryName)).uri
            }

            // Update the missing revision if it's missing
            const uri = SourcegraphUri.parse(selection.uri)
            if (!uri.revision) {
                const metadata = await this.fs.repositoryMetadata(uri.repositoryName)
                const revision = metadata?.defaultBranch || 'HEAD'
                uriString = uri.withRevision(revision).uri
            }
        }
        return SourcegraphUri.parse(uriString)
    }
}
