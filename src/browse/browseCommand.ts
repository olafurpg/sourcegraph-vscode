import * as vscode from 'vscode'

export async function browseCommand(): Promise<void> {
    const clipboard = await vscode.env.clipboard.readText()
    const value = clipboard.startsWith('https://sourcegraph.com') ? clipboard : ''
    const input = await vscode.window.showInputBox({ value })

    if (input) {
        const uri = vscode.Uri.parse(input.replace('https://', 'sourcegraph://'))
        const textDocument = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(textDocument)
    }
}
