import * as vscode from 'vscode'
import { log } from '../log'
export async function createNewNotebookCommand(): Promise<void> {
    try {
        const textDocument = await vscode.workspace.openTextDocument({ language: 'sourcegraph' })
        await vscode.window.showTextDocument(textDocument)
    } catch (error) {
        log.appendLine(`ERROR createNewNotebook ${error}`)
    }
}
