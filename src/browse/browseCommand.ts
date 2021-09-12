import { URL } from 'url'
import * as vscode from 'vscode'
import { BrowseQuickPick } from './BrowseQuickPick'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'

export async function browseCommand(): Promise<void> {
    const clipboard = await vscode.env.clipboard.readText()
    const uri = await new BrowseQuickPick().getBrowseUri(clipboard)
    await openFileCommand(vscode.Uri.parse(uri))
}

export async function openFileCommand(uri: vscode.Uri): Promise<void> {
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
