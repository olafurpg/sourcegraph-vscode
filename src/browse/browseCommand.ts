import { URL } from 'url'
import * as vscode from 'vscode'
import { log } from '../log'
import { BrowseFileSystemProvider } from './BrowseFileSystemProvider'
import { BrowseQuickPick } from './BrowseQuickPick'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'
import { SourcegraphSemanticTokenProvider } from './SourcegraphSemanticTokenProvider'

export async function activateBrowseCommand(context: vscode.ExtensionContext): Promise<void> {
    const fs = new BrowseFileSystemProvider()
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
            openFileCommand(vscode.Uri.parse(uri))
        })
    )
    vscode.languages.registerReferenceProvider({ language: 'sourcegraph' }, fs)
    vscode.languages.registerDocumentSemanticTokensProvider({ language: 'sourcegraph' }, semanticTokens, semanticTokens)
    vscode.window.onDidChangeActiveTextEditor(async editor => await fs.didFocus(editor?.document.uri))
    fs.didFocus(vscode.window.activeTextEditor?.document.uri)
}

async function searchInEditor(tokens: SourcegraphSemanticTokenProvider): Promise<void> {
    try {
        const textDocument = await vscode.workspace.openTextDocument({ language: 'sourcegraph' })
        await vscode.window.showTextDocument(textDocument)
    } catch (error) {
        log.appendLine(`ERROR searchInEditor ${error}`)
    }
}

async function browseCommand(fs: BrowseFileSystemProvider): Promise<void> {
    try {
        const uri = await new BrowseQuickPick().getBrowseUri(fs)
        log.appendLine(`QUICK_PICK_RESULT ${uri}`)
        await openFileCommand(vscode.Uri.parse(uri))
    } catch (error) {
        log.appendLine(`ERROR - browseCommand: ${error}`)
    }
}

async function openFileCommand(uri: vscode.Uri): Promise<void> {
    const textDocument = await vscode.workspace.openTextDocument(uri)
    const parsed = parseBrowserRepoURL(new URL(uri.toString(true).replace('sourcegraph://', 'https://')))
    await vscode.window.showTextDocument(textDocument, {
        selection: getSelection(parsed, textDocument),
        viewColumn: vscode.ViewColumn.Active,
    })
}

function offsetRange(line: number, character: number): vscode.Range {
    const position = new vscode.Position(line, character)
    return new vscode.Range(position, position)
}

function getSelection(parsed: ParsedRepoURI, textDocument: vscode.TextDocument): vscode.Range | undefined {
    if (parsed?.position?.line && parsed?.position?.character) {
        return offsetRange(parsed.position.line - 1, parsed.position.character)
    }
    if (parsed.path && isSymbolicFilename(parsed.path)) {
        const fileNames = parsed.path.split('/')
        const fileName = fileNames[fileNames.length - 1]
        const symbolName = fileName.split('.')[0]
        const text = textDocument.getText()
        const symbolMatches = new RegExp(` ${symbolName}\\b`).exec(text)
        if (symbolMatches) {
            const position = textDocument.positionAt(symbolMatches.index + 1)
            return new vscode.Range(position, position)
        }
    }
    return undefined
}

function isSymbolicFilename(path: string): boolean {
    return !(path.endsWith('.md') || path.endsWith('.markdown') || path.endsWith('.txt') || path.endsWith('.log'))
}
