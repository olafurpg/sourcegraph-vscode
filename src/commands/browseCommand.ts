import * as vscode from 'vscode'
import { log } from '../log'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { BrowseQuickPick } from './BrowseQuickPick'
import { SourcegraphCompletionItemProvider } from '../notebook/SourcegraphCompletionItemProvider'
import { SourcegraphNotebookSerializer } from '../notebook/SourcegraphNotebookSerializer'
import { SourcegraphSemanticTokenProvider } from '../highlighting/SourcegraphSemanticTokenProvider'
import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'

export async function activateBrowseCommand(context: vscode.ExtensionContext): Promise<void> {
    const fs = new SourcegraphFileSystemProvider()
    vscode.workspace.registerFileSystemProvider('sourcegraph', fs, { isReadonly: true })
    vscode.languages.registerHoverProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerDefinitionProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerReferenceProvider({ scheme: 'sourcegraph' }, fs)
    const treeView = vscode.window.createTreeView('sourcegraph.files', { treeDataProvider: fs, showCollapseAll: true })
    fs.setTreeView(treeView)
    const semanticTokens = new SourcegraphSemanticTokenProvider()
    context.subscriptions.push(treeView)
    context.subscriptions.push(vscode.commands.registerCommand('extension.browse', () => browseCommand(fs)))
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.searchInEditor', () => searchInEditor(semanticTokens))
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openFile', (uri: string) => {
            log.appendLine(`openFile=${uri}`)
            openSourcegraphUriCommand(vscode.Uri.parse(uri))
        })
    )
    vscode.languages.registerReferenceProvider({ language: 'sourcegraph' }, fs)
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcegraph' }, semanticTokens, semanticTokens)
    vscode.languages.registerCompletionItemProvider(
        { language: 'sourcegraph' },
        new SourcegraphCompletionItemProvider()
    )
    vscode.window.onDidChangeActiveTextEditor(async editor => await fs.didFocus(editor?.document.uri))
    fs.didFocus(vscode.window.activeTextEditor?.document.uri)
    vscode.workspace.registerNotebookSerializer('sourcegraph-notebook', new SourcegraphNotebookSerializer(), {})
}

async function browseCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const uri = await new BrowseQuickPick().getBrowseUri(fs)
        log.appendLine(`QUICK_PICK_RESULT ${uri}`)
        await openSourcegraphUriCommand(vscode.Uri.parse(uri))
    } catch (error) {
        log.appendLine(`ERROR - browseCommand: ${error}`)
    }
}

async function searchInEditor(tokens: SourcegraphSemanticTokenProvider): Promise<void> {
    try {
        const textDocument = await vscode.workspace.openTextDocument({ language: 'sourcegraph' })
        await vscode.window.showTextDocument(textDocument)
    } catch (error) {
        log.appendLine(`ERROR searchInEditor ${error}`)
    }
}
