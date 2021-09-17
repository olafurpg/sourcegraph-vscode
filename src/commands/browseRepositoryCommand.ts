import * as vscode from 'vscode'
import repositoriesQuery from '../queries/repositoriesQuery'

import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import SourcegraphUri from '../file-system/SourcegraphUri'
import { log } from '../log'
import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { BrowseQuickPickItem, SourcegraphQuickPick } from './SourcegraphQuickPick'

const RECENTLY_BROWSED_REPOSITORIES_KEY = 'recentlyBrowsedRepositories'

export default async function browseRepositoryCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const sg = new SourcegraphQuickPick(fs)
        const recentlyBrowsedRepositories = loadRecentlyBrowsedRepositoriesSetting()
        sg.pick.items = recentlyBrowsedRepositories
        sg.onDidChangeValue(async query => {
            if (query.text === '') {
                sg.pick.items = recentlyBrowsedRepositories
                return
            }
            sg.pick.busy = true
            const repos = await repositoriesQuery(query.text, query.token)
            if (!query.token.isCancellationRequested) {
                const queryItems: BrowseQuickPickItem[] = repos.map(repo => ({
                    label: repositoryLabel(repo),
                    uri: '',
                    unresolvedRepositoryName: repo,
                }))
                sg.pick.items = [...queryItems, ...recentlyBrowsedRepositories]
                sg.pick.busy = false
            }
        })
        const uri = await sg.showQuickPickAndGetUserInput()
        updateRecentlyBrowsedRepositoriesSetting({ label: uri.repositoryName, uri: uri.uri })
        await openSourcegraphUriCommand(uri)
    } catch (error) {
        if (typeof error !== 'undefined') {
            log.appendLine(`ERROR - browseRepositoryCommand: ${error}`)
        }
    }
}

function repositoryLabel(repositoryName: string): string {
    return repositoryName.startsWith('github.com') ? `\$(mark-github) ${repositoryName}` : repositoryName
}

interface RecentlyBrowsedRepositoryItem {
    label: string
    uri: string
}
const config = vscode.workspace.getConfiguration('sourcegraph')

function updateRecentlyBrowsedRepositoriesSetting(newValue: RecentlyBrowsedRepositoryItem): void {
    const oldSettingValues = config
        .get<any[]>(RECENTLY_BROWSED_REPOSITORIES_KEY, [])
        .filter(item => item?.label !== newValue.label)
    config.update(
        RECENTLY_BROWSED_REPOSITORIES_KEY,
        [newValue, ...oldSettingValues].slice(0, 10),
        vscode.ConfigurationTarget.Global
    )
}

function loadRecentlyBrowsedRepositoriesSetting(): BrowseQuickPickItem[] {
    const result: BrowseQuickPickItem[] = []
    const settingValues = config.get<any[]>(RECENTLY_BROWSED_REPOSITORIES_KEY, [])
    const validSettingValues: RecentlyBrowsedRepositoryItem[] = []
    for (const settingValue of settingValues) {
        if (typeof settingValue !== 'object') {
            continue
        }
        const label = settingValue?.label
        if (typeof label !== 'string') {
            continue
        }
        try {
            const uri = SourcegraphUri.parse(settingValue?.uri as string)
            validSettingValues.push({ label, uri: uri.uri })
            result.push({
                uri: uri.uri,
                label: repositoryLabel(label),
                description: uri.path,
            })
        } catch (_error) {}
    }
    if (result.length !== settingValues.length) {
        config.update(RECENTLY_BROWSED_REPOSITORIES_KEY, result, vscode.ConfigurationTarget.Global)
    }
    return result
}
