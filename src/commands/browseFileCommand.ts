import * as vscode from 'vscode'
import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import SourcegraphUri from '../file-system/SourcegraphUri'
import { BrowseQuickPickItem, SourcegraphQuickPick } from './SourcegraphQuickPick'

const RECENTLY_BROWSED_FILES_KEY = 'recentlyBrowsedFiles'

const CONFIG = vscode.workspace.getConfiguration('sourcegraph')

export default async function browseFileCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const sg = new SourcegraphQuickPick(fs)
        sg.pick.title = 'Go to a file or paste a Sourcegraph URL'
        const recentlyBrowsedFiles = loadRecentlyBrowsedFilesSetting()
        const fileItems = [...recentlyBrowsedFiles]
        sg.pick.items = fileItems
        sg.pick.busy = true
        fs.allFileFromOpenRepositories().then(allFiles => {
            for (const repo of allFiles) {
                for (const file of repo.fileNames) {
                    if (file === '') {
                        continue
                    }
                    // Intentionally avoid using `SourcegraphUri.parse()` for
                    // performance reasons.  This loop is a hot path for large
                    // repositories like chromium/chromium with ~400k files.
                    fileItems.push({
                        uri: `${repo.repositoryUri}/-/blob/${file}`,
                        label: file,
                        description: repo.repositoryName,
                    })
                }
            }
            sg.pick.busy = false
            sg.pick.items = fileItems
        })
        sg.onDidChangeValue(value => {
            if (value.text.startsWith('https://sourcegraph.com')) {
                const item = parseRecentlyBrowsedFile(value.text)
                if (item) {
                    sg.pick.items = [item]
                } else {
                    // TODO: Report some kind or error message
                    log.appendLine(`NO parsed.path ${value}`)
                    sg.pick.items = fileItems
                }
            } else {
                sg.pick.items = fileItems
            }
        })
        const uri = await sg.showQuickPickAndGetUserInput()
        updateRecentlyBrowsedFilesSetting(uri.uri)
        await openSourcegraphUriCommand(uri)
    } catch (error) {
        if (typeof error !== 'undefined') {
            log.appendLine(`ERROR - browseFileCommand: ${error}`)
        }
    }
}

function updateRecentlyBrowsedFilesSetting(newValue: string): void {
    const oldValues = CONFIG.get<string[]>(RECENTLY_BROWSED_FILES_KEY, [])
    if (!oldValues.includes(newValue)) {
        CONFIG.update(RECENTLY_BROWSED_FILES_KEY, [newValue, ...oldValues].slice(0, 10))
    }
}

function loadRecentlyBrowsedFilesSetting(): BrowseQuickPickItem[] {
    const settingValues = CONFIG.get<string[]>(RECENTLY_BROWSED_FILES_KEY, [])
    const result: BrowseQuickPickItem[] = []
    const validSettingValues: string[] = []
    for (const value of settingValues) {
        const item = parseRecentlyBrowsedFile(value)
        if (item) {
            validSettingValues.push(value)
            result.push(item)
        }
    }
    if (validSettingValues.length !== settingValues.length) {
        CONFIG.update(RECENTLY_BROWSED_FILES_KEY, validSettingValues, vscode.ConfigurationTarget.Global)
    }
    return result
}

/**
 * @param settingValue the value from the user settings, which may be invalid because users can manually update settings.
 * @returns undefined when the setting value is invalid.
 */
function parseRecentlyBrowsedFile(settingValue: string): BrowseQuickPickItem | undefined {
    try {
        const uri = SourcegraphUri.parse(settingValue)
        if (uri.path) {
            return {
                uri: uri.uri,
                label: uri.path,
                description: uri.repositoryName,
                detail: settingValue,
                unresolvedRepositoryName: uri.repositoryName,
            }
        }
    } catch (_error) {}
    return undefined
}
