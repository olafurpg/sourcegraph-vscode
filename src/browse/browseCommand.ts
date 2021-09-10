import { URL } from 'url'
import * as vscode from 'vscode'
import { parseBrowserRepoURL } from './parseRepoUrl'

export async function browseCommand(): Promise<void> {
    const clipboard = await vscode.env.clipboard.readText()
    const value = clipboard.startsWith('https://sourcegraph.com') ? clipboard : ''
    const input = await vscode.window.showInputBox({ value })

    if (input) {
        const uri = vscode.Uri.parse(input.replace('https://', 'sourcegraph://'))
        const parsed = parseBrowserRepoURL(new URL(input))
        const textDocument = await vscode.workspace.openTextDocument(uri)
        const position = parsed.position
            ? new vscode.Position(parsed.position?.line - 1, parsed.position?.character)
            : undefined
        await vscode.window.showTextDocument(textDocument, {
            selection: position ? new vscode.Range(position, position) : undefined,
            viewColumn: vscode.ViewColumn.Active,
        })
    }
}
