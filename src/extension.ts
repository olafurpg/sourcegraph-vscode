import open from 'open'
import * as vscode from 'vscode'
import { getSourcegraphUrl } from './config'
import { repoInfo } from './git'
import { browseCommand } from './browse/browseCommand'
import { BrowseFileSystemProvider } from './browse/BrowseFileSystemProvider'

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const { version } = require('../package.json')

/**
 * Displays an error message to the user.
 */
async function showError(error: Error): Promise<void> {
    await vscode.window.showErrorMessage(error.message)
}

const handleCommandErrors = <P extends unknown[], R>(command: (...args: P) => Promise<R>) => async (
    ...args: P
): Promise<R | void> => {
    try {
        return await command(...args)
    } catch (error) {
        if (error instanceof Error) {
            await showError(error)
        }
    }
}

/**
 * The command implementation for opening a cursor selection on Sourcegraph.
 */
async function openCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    const { remoteURL, branch, fileRelative } = repositoryInfo

    // Open in browser.
    await open(
        `${getSourcegraphUrl()}/-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRelative)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(version)}` +
            `&start_row=${encodeURIComponent(String(editor.selection.start.line))}` +
            `&start_col=${encodeURIComponent(String(editor.selection.start.character))}` +
            `&end_row=${encodeURIComponent(String(editor.selection.end.line))}` +
            `&end_col=${encodeURIComponent(String(editor.selection.end.character))}`
    )
}

/**
 * The command implementation for searching a cursor selection on Sourcegraph.
 */
async function searchCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor) {
        throw new Error('No active editor')
    }
    const repositoryInfo = await repoInfo(editor.document.uri.fsPath)
    if (!repositoryInfo) {
        return
    }
    const { remoteURL, branch, fileRelative } = repositoryInfo

    const query = editor.document.getText(editor.selection)
    if (query === '') {
        return // nothing to query
    }

    // Search in browser.
    await open(
        `${getSourcegraphUrl()}/-/editor` +
            `?remote_url=${encodeURIComponent(remoteURL)}` +
            `&branch=${encodeURIComponent(branch)}` +
            `&file=${encodeURIComponent(fileRelative)}` +
            `&editor=${encodeURIComponent('VSCode')}` +
            `&version=${encodeURIComponent(version)}` +
            `&search=${encodeURIComponent(query)}`
    )
}

/**
 * Called when the extension is activated.
 */
export function activate(context: vscode.ExtensionContext): void {
    // Register our extension commands (see package.json).
    context.subscriptions.push(vscode.commands.registerCommand('extension.open', handleCommandErrors(openCommand)))
    context.subscriptions.push(vscode.commands.registerCommand('extension.search', handleCommandErrors(searchCommand)))

    // Register browse-related features.
    const fs = new BrowseFileSystemProvider()
    vscode.workspace.registerFileSystemProvider('sourcegraph', fs, { isReadonly: true })
    vscode.languages.registerHoverProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerDefinitionProvider({ scheme: 'sourcegraph' }, fs)
    vscode.languages.registerReferenceProvider({ scheme: 'sourcegraph' }, fs)
    // context.subscriptions.push(vscode.window.createTreeView('sourcegraph.files', { treeDataProvider: fs }))
    context.subscriptions.push(vscode.commands.registerCommand('extension.browse', handleCommandErrors(browseCommand)))
}

export function deactivate(): void {
    // no-op
}
