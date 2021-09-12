import { URL } from 'url'
import * as vscode from 'vscode'
import { log } from '../log'
import { parseBrowserRepoURL } from './parseRepoUrl'

interface BrowseQuickPickItem extends vscode.QuickPickItem {
    uri: string
}
export class BrowseQuickPick {
    public getBrowseUri(clipboard?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            let selection: BrowseQuickPickItem | undefined = undefined
            const pick = vscode.window.createQuickPick<BrowseQuickPickItem>()
            const onDidChangeValue = (value: string) => {
                log.appendLine(`VALUE: ${value}`)
                if (value.startsWith('https://sourcegraph.com')) {
                    const parsed = parseBrowserRepoURL(new URL(value))
                    if (parsed.path) {
                        const item: BrowseQuickPickItem = {
                            uri: value.replace('https://', 'sourcegraph://').replace(/#.*$/, ''),
                            label: value,
                            detail: `${parsed.repository}/-/${parsed.path}`,
                        }
                        log.appendLine(`UPDATE: item=${JSON.stringify(item)}`)

                        pick.items = [item]
                    } else {
                        log.appendLine(`NO parsed.path ${value}`)
                        // Report some kind or error message
                    }
                } else {
                    log.appendLine(`NO sourcegraph.com`)
                }
            }
            if (clipboard?.startsWith('https://sourcegraph')) {
                pick.value = clipboard
            }
            pick.onDidChangeValue(onDidChangeValue)
            pick.onDidChangeSelection(items => {
                if (items.length > 0) {
                    selection = items[items.length - 1]
                }
            })
            pick.onDidAccept(() => {
                if (selection) {
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
