import * as vscode from 'vscode'
import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import repositoriesQuery from '../queries/repositoriesQuery'
import SourcegraphUri from '../file-system/SourcegraphUri'

export default async function browseCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const uri = await new BrowseQuickPick().getBrowseUri(fs)
        await openSourcegraphUriCommand(uri)
    } catch (error) {
        if (typeof error !== 'undefined') {
            log.appendLine(`ERROR - browseCommand: ${error}`)
        }
    }
}

const RECENTLY_BROWSED_FILES_KEY = 'recentlyBrowsedFiles'

class BrowseQuickPick {
    private config = vscode.workspace.getConfiguration('sourcegraph')
    private recentlyBrowsedUris: string[] = this.config.get<string[]>(RECENTLY_BROWSED_FILES_KEY, [])
    private recentlyBrowsedItems: BrowseQuickPickItem[] = []
    constructor() {
        const validUris: string[] = []
        for (const uri of this.recentlyBrowsedUris) {
            const item = browseQuickPickItem(uri)
            if (item) {
                validUris.push(uri)
                this.recentlyBrowsedItems.push(item)
            }
        }
        if (validUris.length !== this.recentlyBrowsedUris.length) {
            this.config.update(RECENTLY_BROWSED_FILES_KEY, validUris, vscode.ConfigurationTarget.Global)
        }
    }

    public async getBrowseUri(fs: SourcegraphFileSystemProvider): Promise<SourcegraphUri> {
        return new Promise((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            const pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
            pick.title = 'Open a file, paste a Sourcegraph URL or type repo:QUERY to open a repository'
            pick.ignoreFocusOut = true
            pick.matchOnDescription = true
            pick.matchOnDetail = true
            let isAllFilesEnabled = false
            pick.items = this.recentlyBrowsedItems
            let pendingRequests: vscode.CancellationTokenSource | undefined
            const onDidChangeValue = async (value: string) => {
                if (pendingRequests) {
                    pendingRequests.cancel()
                    pendingRequests.dispose()
                    pendingRequests = undefined
                }
                if (value.startsWith('https://sourcegraph.com')) {
                    const item = browseQuickPickItem(value)
                    if (item) {
                        pick.items = [item]
                        isAllFilesEnabled = false
                    } else {
                        log.appendLine(`NO parsed.path ${value}`)
                        // TODO: Report some kind or error message
                    }
                } else if (value.startsWith('repo:')) {
                    pendingRequests = new vscode.CancellationTokenSource()
                    pick.busy = true
                    const query = value.slice('repo:'.length)
                    const repos = await repositoriesQuery(query, pendingRequests.token)
                    if (!pendingRequests.token.isCancellationRequested) {
                        pick.items = repos.map(repo => ({
                            label: `repo:${repo}`,
                            uri: '',
                            unresolvedRepositoryName: repo,
                        }))
                        isAllFilesEnabled = false
                        pick.busy = false
                    }
                } else if (!isAllFilesEnabled) {
                    isAllFilesEnabled = true
                    pick.busy = true
                    const allFiles = await fs.allFileFromOpenRepositories()
                    pick.busy = false
                    const newItems: BrowseQuickPickItem[] = [...this.recentlyBrowsedItems]
                    for (const repo of allFiles) {
                        for (const file of repo.fileNames) {
                            if (file === '') {
                                continue
                            }
                            newItems.push({
                                uri: repo.repositoryUri.withPath(file).uri,
                                label: file,
                                detail: repo.repositoryLabel,
                            })
                        }
                    }
                    pick.items = newItems
                }
            }
            onDidChangeValue(pick.value)
            fs.onNewRepo(() => {
                isAllFilesEnabled = false
                onDidChangeValue(pick.value)
            })
            pick.onDidChangeValue(onDidChangeValue)
            pick.onDidChangeSelection(items => {
                if (items.length > 0) {
                    selection = items[items.length - 1]
                }
            })
            pick.onDidAccept(async () => {
                if (!selection) {
                    log.appendLine(`onDidAccept - selection is empty`)
                    return
                }
                pick.busy = true
                try {
                    if (selection.unresolvedRepositoryName) {
                        // Update the missing file path if it's missing
                        if (!selection.uri || !SourcegraphUri.parse(selection.uri).path) {
                            selection.uri = (await fs.defaultFileUri(selection.unresolvedRepositoryName)).uri
                        }

                        // Update the missing revision if it's missing
                        const uri = SourcegraphUri.parse(selection.uri)
                        if (!uri.revision) {
                            const metadata = await fs.repositoryMetadata(uri.repositoryName)
                            const revision = metadata?.defaultBranch || 'HEAD'
                            selection.uri = uri.withRevision(revision).uri
                        }
                    }
                    this.addRecentlyBrowsedFile(selection.uri)
                    resolve(SourcegraphUri.parse(selection.uri))
                    pick.dispose()
                } catch (error) {
                    pick.busy = false
                    log.appendLine(`ERROR onDidAccept error=${error} selection=${JSON.stringify(selection)}`)
                }
            })
            pick.onDidHide(() => {
                pick.dispose()
                reject()
            })
            pick.show()
        })
    }

    private addRecentlyBrowsedFile(value: string) {
        if (!this.recentlyBrowsedUris.includes(value)) {
            this.recentlyBrowsedUris = [value, ...this.recentlyBrowsedUris.slice(0, 9)]
            this.config.update(RECENTLY_BROWSED_FILES_KEY, this.recentlyBrowsedUris, vscode.ConfigurationTarget.Global)
        }
    }
}

interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
    unresolvedRepositoryName?: string
}

function browseQuickPickItem(value: string): BrowseQuickPickItem | undefined {
    try {
        const uri = SourcegraphUri.parse(value)
        if (uri.path) {
            return {
                uri: uri.uri,
                label: uri.path,
                description: uri.repositoryName,
                detail: value,
                unresolvedRepositoryName: uri.repositoryName,
            }
        }
    } catch (_error) {}
    return undefined
}
