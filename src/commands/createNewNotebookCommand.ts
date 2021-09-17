import * as vscode from 'vscode'

export default async function createNewNotebookCommand(): Promise<void> {
    const textDocument = await vscode.workspace.openTextDocument({ language: 'sourcegraph' })
    await vscode.window.showTextDocument(textDocument)
}
