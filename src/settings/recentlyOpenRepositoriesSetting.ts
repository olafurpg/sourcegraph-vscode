import * as vscode from 'vscode'
import { BrowseQuickPickItem as SourcegraphQuickPickItem } from '../commands/SourcegraphQuickPick'
import SourcegraphUri from '../file-system/SourcegraphUri'
import readConfiguration from './readConfiguration'

export default {
    label: repositoryLabel,
    load: loadRecentlyBrowsedRepositoriesSetting,
    update: updateRecentlyBrowsedRepositoriesSetting,
}

export interface RecentlyBrowsedRepositoryItem {
    label: string
    uri: string
}

const settingKey = 'recentlyOpenRepositories'

function repositoryLabel(repositoryName: string): string {
    return repositoryName.startsWith('github.com') ? `\$(mark-github) ${repositoryName}` : repositoryName
}

function updateRecentlyBrowsedRepositoriesSetting(newValue: RecentlyBrowsedRepositoryItem): void {
    const config = readConfiguration()
    const oldSettingValues = config.get<any[]>(settingKey, []).filter(item => item?.label !== newValue.label)
    config.update(settingKey, [newValue, ...oldSettingValues].slice(0, 10), vscode.ConfigurationTarget.Global)
}

function loadRecentlyBrowsedRepositoriesSetting(): SourcegraphQuickPickItem[] {
    const config = readConfiguration()
    const result: SourcegraphQuickPickItem[] = []
    const settingValues = config.get<any[]>(settingKey, [])
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
                detail: 'Recently open',
            })
        } catch (_error) {}
    }
    if (result.length !== settingValues.length) {
        config.update(settingKey, result, vscode.ConfigurationTarget.Global)
    }
    return result
}
