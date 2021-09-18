import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from './file-system/SourcegraphFileSystemProvider'
import { SourcegraphSemanticTokenProvider } from './search/SourcegraphSemanticTokenProvider'
import { goToFileCommand } from './commands/goToFileCommand'
import { createNewNotebookCommand } from './commands/createNewNotebookCommand'
import { openSourcegraphUriCommand } from './commands/openSourcegraphUriCommand'
import { SourcegraphUri } from './file-system/SourcegraphUri'
import { goToRepositoryCommand } from './commands/goToRepositoryCommand'
import { openCommand } from './commands/openCommand'
import { searchCommand } from './commands/searchCommand'
import { SourcegraphCompletionItemProvider } from './search/SourcegraphCompletionItemProvider'
import { SourcegraphNotebookSerializer } from './search/SourcegraphNotebookSerializer'
import { log } from './log'
import { searchSelectionCommand } from './commands/searchSelectionCommand'
import { SourcegraphHoverProvider } from './code-intel/SourcegraphHoverProvider'
import { SourcegraphDefinitionProvider } from './code-intel/SourcegraphDefinitionProvider'
import { SourcegraphReferenceProvider } from './code-intel/SourcegraphReferenceProvider'
import { SourcegraphTreeDataProvider } from './file-system/SourcegraphTreeDataProvider'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
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
            handleCommandErrors('extension.search', () => searchCommand())
        )
    )

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'extension.search.selection',
            handleCommandErrors('extension.search.selection', () => searchSelectionCommand(version))
        )
    )

    // Register file-system related functionality.
    const fs = new SourcegraphFileSystemProvider()
    const referenceProvider = new SourcegraphReferenceProvider(fs)
    vscode.workspace.registerFileSystemProvider('sourcegraph', fs, { isReadonly: true })
    vscode.languages.registerHoverProvider({ scheme: 'sourcegraph' }, new SourcegraphHoverProvider(fs))
    vscode.languages.registerDefinitionProvider({ scheme: 'sourcegraph' }, new SourcegraphDefinitionProvider(fs))
    vscode.languages.registerReferenceProvider({ scheme: 'sourcegraph' }, referenceProvider)
    const treeDataProvider = new SourcegraphTreeDataProvider(fs)
    const treeView = vscode.window.createTreeView<string>('sourcegraph.files', {
        treeDataProvider,
        showCollapseAll: true,
    })
    treeDataProvider.setTreeView(treeView)
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
        vscode.commands.registerCommand(
            'extension.focusActiveFile',
            handleCommandErrors('extension.focusActiveFile', () => treeDataProvider.focusActiveFile())
        )
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('extension.openFile', async uri => {
            if (typeof uri === 'string') {
                await openSourcegraphUriCommand(SourcegraphUri.parse(uri))
            } else {
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                log.error(`extension.openFile(${uri}) argument is not a string`)
            }
        })
    )

    // Register Notebooks related functionality.
    vscode.languages.registerReferenceProvider({ language: 'sourcegraph' }, referenceProvider)
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcegraph' }, semanticTokens, semanticTokens)
    vscode.languages.registerCompletionItemProvider(
        { language: 'sourcegraph' },
        new SourcegraphCompletionItemProvider()
    )
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => treeDataProvider.didFocus(editor?.document.uri))
    )
    treeDataProvider.didFocus(vscode.window.activeTextEditor?.document.uri).then(
        () => {},
        () => {}
    )
    vscode.workspace.registerNotebookSerializer('sourcegraph-notebook', new SourcegraphNotebookSerializer(fs), {})
}

export function deactivate(): void {
    // no-op
}
