import { URL } from 'url'
import * as vscode from 'vscode'
import { log } from '../log'
import { BrowseFileSystemProvider } from './BrowseFileSystemProvider'
import { repositories } from './graphqlQuery'
import { parseBrowserRepoURL } from './parseRepoUrl'

interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
    repo?: string
}
export class BrowseQuickPick {
    public getBrowseUri(fs?: BrowseFileSystemProvider): Promise<string> {
        return new Promise((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            const pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
            pick.title = 'Open a file, paste a Sourcegraph URL or type repo:QUERY to open a repository'
            pick.matchOnDescription
            let isAllFilesEnabled = false
            const onDidChangeValue = async (value: string) => {
                log.appendLine(`VALUE: ${value}`)
                if (value.startsWith('https://sourcegraph.com')) {
                    const parsed = parseBrowserRepoURL(new URL(value))
                    if (parsed.path) {
                        const item: BrowseQuickPickItem = {
                            uri: value.replace('https://', 'sourcegraph://').replace(/#.*/, '').replace(/\?.*/, ''),
                            label: value,
                            detail: `${parsed.repository}/-/${parsed.path}`,
                        }
                        pick.items = [item]
                        isAllFilesEnabled = false
                    } else {
                        log.appendLine(`NO parsed.path ${value}`)
                        // Report some kind or error message
                    }
                } else if (value.startsWith('repo:')) {
                    isAllFilesEnabled = false
                    pick.busy = true
                    const query = value.slice('repo:'.length)
                    const repos = await repositories(query)
                    pick.items = repos.map(repo => ({
                        label: `repo:${repo}`,
                        uri: ``,
                        repo,
                    }))
                    pick.busy = false
                } else if (fs) {
                    if (!isAllFilesEnabled) {
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
                                const label = `${file} - ${repo.repositoryLabel}`
                                newItems.push({
                                    uri,
                                    label,
                                    detail: repo.repositoryLabel,
                                })
                            }
                        }
                        pick.items = newItems
                    }
                } else {
                    pick.items = []
                    isAllFilesEnabled = false
                    log.appendLine(`NO sourcegraph.com ${value}`)
                }
            }
            onDidChangeValue(pick.value)
            fs?.onNewRepo(() => {
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
                if (selection) {
                    if (fs && selection.repo) {
                        selection.uri = await fs.defaultFileUri(selection.repo)
                    }
                    resolve(selection.uri)
                }
                pick.dispose()
            })
            pick.onDidHide(() => {
                pick.dispose()
                reject()
            })
            pick.show()
        })
    }
}
