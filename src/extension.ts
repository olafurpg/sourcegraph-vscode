import * as vscode from 'vscode'
import SourcegraphFileSystemProvider from './file-system/SourcegraphFileSystemProvider'
import SourcegraphSemanticTokenProvider from './highlighting/SourcegraphSemanticTokenProvider'
import goToFileCommand from './commands/goToFileCommand'
import createNewNotebookCommand from './commands/createNewNotebookCommand'
import openSourcegraphUriCommand from './commands/openSourcegraphUriCommand'
import SourcegraphUri from './file-system/SourcegraphUri'
import goToRepositoryCommand from './commands/goToRepositoryCommand'
import openCommand from './commands/openCommand'
import searchCommand from './commands/searchCommand'
import SourcegraphCompletionItemProvider from './notebook/SourcegraphCompletionItemProvider'
import SourcegraphNotebookSerializer from './notebook/SourcegraphNotebookSerializer'
import log from './log'

const { version } = require('../package.json')

/**
 * Displays an error message to the user.
 */
async function showError(error: Error): Promise<void> {
    await vscode.window.showErrorMessage(error.message)
}

const handleCommandErrors =
    <P extends unknown[], R>(what: string, command: (...args: P) => Promise<R>) =>
    async (...args: P): Promise<R | void> => {
        try {
            return await command(...args)
        } catch (error) {
            if (error instanceof Error) {
                log.error(what, error)
                await showError(error)
            }
        }
    }

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register our extension commands (see package.json).
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.open',
            handleCommandErrors('extension.open', () => openCommand(version))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.search',
            handleCommandErrors('extension.search', () => searchCommand(version))
        )
    )

    // Register file-system related functionality.
    const fs = new SourcegraphFileSystemProvider()
    vscode.workspace.registerFileSystemProvider('sourcegraph', fs, { isReadonly: true })
    vscode.languages.registerHoverProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerDefinitionProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerReferenceProvider({ scheme: 'sourcegraph' }, fs)
    const treeView = vscode.window.createTreeView('sourcegraph.files', { treeDataProvider: fs, showCollapseAll: true })
    fs.setTreeView(treeView)
    const semanticTokens = new SourcegraphSemanticTokenProvider()
    context.subscriptions.push(treeView)
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.goToFile',
            handleCommandErrors('extension.goToFile', () => goToFileCommand(fs))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.goToRepository',
            handleCommandErrors('extension.goToRepository', () => goToRepositoryCommand(fs))
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.newNotebook',
            handleCommandErrors('extension.newNotebook', () => createNewNotebookCommand())
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openFile', async uri => {
            log.appendLine(`openFile ${uri}`)
            if (typeof uri === 'string') {
                await openSourcegraphUriCommand(SourcegraphUri.parse(uri))
            } else {
                log.error(`extension.openFile(${uri}) argument is not a string`)
            }
        })
    )

    // Register Notebooks related functionality.
    vscode.languages.registerReferenceProvider({ language: 'sourcegraph' }, fs)
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcegraph' }, semanticTokens, semanticTokens)
    vscode.languages.registerCompletionItemProvider(
        { language: 'sourcegraph' },
        new SourcegraphCompletionItemProvider()
    )
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(async editor => await fs.didFocus(editor?.document.uri))
    )
    fs.didFocus(vscode.window.activeTextEditor?.document.uri)
    vscode.workspace.registerNotebookSerializer('sourcegraph-notebook', new SourcegraphNotebookSerializer(), {})
}

export function deactivate(): void {
    // no-op
}
