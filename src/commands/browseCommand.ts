import * as vscode from 'vscode'
import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { repositoriesQuery } from '../queries/repositoriesQuery'
import { SourcegraphUri } from '../file-system/SourcegraphUri'

export async function browseCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const uri = await new BrowseQuickPick().getBrowseUri(fs)
        await openSourcegraphUriCommand(vscode.Uri.parse(uri))
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
        for (const file of this.recentlyBrowsedUris) {
            const item = browseQuickPickItem(file)
            if (item) {
                this.recentlyBrowsedItems.push(item)
            }
        }
    }

    public async getBrowseUri(fs: SourcegraphFileSystemProvider): Promise<string> {
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
                            uri: ``,
                            repo,
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
                                uri: `${repo.repositoryUri}/-/blob/${file}`,
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
                pick.busy = true
                try {
                    if (selection) {
                        if (selection.repo) {
                            if (!selection.uri || !SourcegraphUri.parse(selection.uri).path) {
                                selection.uri = (await fs.defaultFileUri(selection.repo)).uri
                            }
                            const uri = SourcegraphUri.parse(selection.uri)
                            if (!uri.revision) {
                                const metadata = await fs.repositoryMetadata(uri.repository)
                                const revision = metadata?.defaultBranch || 'HEAD'
                                selection.uri = uri.withRevision(revision).uri
                            }
                        }
                        this.addRecentlyBrowsedFile(selection.uri)
                        resolve(selection.uri)
                        pick.dispose()
                    }
                } catch (error) {
                    log.appendLine(`ERROR selection ${error} ${JSON.stringify(selection)}`)
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
    repo?: string
}

function browseQuickPickItem(value: string): BrowseQuickPickItem | undefined {
    const parsed = SourcegraphUri.parse(value)
    if (parsed.path) {
        const revision = parsed.revision ? `@${parsed.revision}` : ''
        return {
            uri: `sourcegraph://${parsed.url.host}/${parsed.repository}${revision}/-/blob/${parsed.path}`,
            label: parsed.path,
            description: parsed.repository,
            detail: value,
            repo: parsed.repository,
        }
    }
    return undefined
}
