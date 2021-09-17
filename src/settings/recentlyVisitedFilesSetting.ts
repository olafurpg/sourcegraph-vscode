import * as vscode from 'vscode'
import { BrowseQuickPickItem } from '../commands/SourcegraphQuickPick'
import SourcegraphUri from '../file-system/SourcegraphUri'

const config = vscode.workspace.getConfiguration('sourcegraph')
const settingKey = 'recentlyVisitedFiles'

export default {
    load: loadRecentlyVisitedFilesSetting,
    update: updateRecentlyVisitedFilesSetting,
}

function updateRecentlyVisitedFilesSetting(newValue: string): void {
    const oldValues = config.get<string[]>(settingKey, [])
    if (!oldValues.includes(newValue)) {
        config.update(settingKey, [newValue, ...oldValues].slice(0, 10))
    }
}

function loadRecentlyVisitedFilesSetting(): BrowseQuickPickItem[] {
    const settingValues = config.get<string[]>(settingKey, [])
    const result: BrowseQuickPickItem[] = []
    const validSettingValues: string[] = []
    for (const value of settingValues) {
        const item = parseRecentlyVisitedFile(value)
        if (item) {
            validSettingValues.push(value)
            result.push(item)
        }
    }
    if (validSettingValues.length !== settingValues.length) {
        config.update(settingKey, validSettingValues, vscode.ConfigurationTarget.Global)
    }
    return result
}

/**
 * @param settingValue the value from the user settings, which may be invalid because users can manually update settings.
 * @returns undefined when the setting value is invalid.
 */
function parseRecentlyVisitedFile(settingValue: string): BrowseQuickPickItem | undefined {
    try {
        const uri = SourcegraphUri.parse(settingValue)
        if (uri.path) {
            return {
                uri: uri.uri,
                label: uri.path,
                description: uri.repositoryName,
                detail: 'Recently visited',
                unresolvedRepositoryName: uri.repositoryName,
            }
        }
    } catch (_error) {}
    return undefined
}
