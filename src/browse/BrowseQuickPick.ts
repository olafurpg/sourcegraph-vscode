import { URL } from 'url'
import * as vscode from 'vscode'
import { log } from '../log'
import { BrowseFileSystemProvider } from './BrowseFileSystemProvider'
import { repositories } from './graphqlQuery'
import { parseBrowserRepoUri, parseBrowserRepoURL, repoUriRepository } from './parseRepoUrl'

interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
    repo?: string
}
export class BrowseQuickPick {
    public getBrowseUri(fs: BrowseFileSystemProvider): Promise<string> {
        return new Promise((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            const pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
            pick.title = 'Open a file, paste a Sourcegraph URL or type repo:QUERY to open a repository'
            pick.matchOnDetail = true
            let isAllFilesEnabled = false
            let token: vscode.CancellationTokenSource | undefined
            const onDidChangeValue = async (value: string) => {
                if (token) {
                    token.cancel()
                    token.dispose()
                    token = undefined
                }
                log.appendLine(`VALUE: ${value}`)
                if (value.startsWith('https://sourcegraph.com')) {
                    const parsed = parseBrowserRepoURL(new URL(value))
                    if (parsed.path) {
                        const item: BrowseQuickPickItem = {
                            uri: `sourcegraph://${parsed.url.host}/${parsed.repository}/-/blob/${parsed.path}`,
                            label: value,
                            detail: `${parsed.repository}/-/${parsed.path}`,
                            repo: parsed.repository,
                        }
                        pick.items = [item]
                        isAllFilesEnabled = false
                    } else {
                        log.appendLine(`NO parsed.path ${value}`)
                        // Report some kind or error message
                    }
                } else if (value.startsWith('repo:')) {
                    token = new vscode.CancellationTokenSource()
                    pick.busy = true
                    const query = value.slice('repo:'.length)
                    const repos = await repositories(query, token.token)
                    if (!token.token.isCancellationRequested) {
                        pick.items = repos.map(repo => ({
                            label: `repo:${repo}`,
                            uri: ``,
                            repo,
                        }))
                        isAllFilesEnabled = false
                        pick.busy = false
                    }
                } else if (!isAllFilesEnabled) {
                    log.appendLine(`FETCHING_FILES`)
                    isAllFilesEnabled = true
                    pick.busy = true
                    const allFiles = await fs.allFileFromOpenRepositories()
                    // log.appendLine(`ALL_FILES ${JSON.stringify(allFiles)}`)
                    pick.busy = false
                    const newItems: BrowseQuickPickItem[] = []
                    for (const repo of allFiles) {
                        for (const file of repo.fileNames) {
                            if (file === '') {
                                continue
                            }
                            const uri = `${repo.repositoryUri}/-/blob/${file}`
                            newItems.push({
                                uri,
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
                            if (!selection.uri || !parseBrowserRepoUri(selection.uri).path) {
                                selection.uri = await fs.defaultFileUri(selection.repo)
                            }
                            const parsed = parseBrowserRepoUri(selection.uri)
                            if (!parsed.revision) {
                                const metadata = await fs.repositoryMetadata(parsed.repository)
                                parsed.revision = metadata?.defaultBranch || 'HEAD'
                                selection.uri = `${repoUriRepository(parsed)}/-/blob/${parsed.path}`
                            }
                        }
                        resolve(selection.uri)
                    }
                    pick.dispose()
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
}
