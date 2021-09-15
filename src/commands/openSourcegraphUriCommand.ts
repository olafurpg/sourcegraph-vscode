import * as vscode from 'vscode'
import { SourcegraphUri } from '../file-system/SourcegraphUri'

export async function openSourcegraphUriCommand(uri: SourcegraphUri): Promise<void> {
    const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri.uri))
    const selection = getSelection(uri, textDocument)
    await vscode.window.showTextDocument(textDocument, {
        selection,
        viewColumn: vscode.ViewColumn.Active,
    })
}

function getSelection(parsed: SourcegraphUri, textDocument: vscode.TextDocument): vscode.Range | undefined {
    if (typeof parsed?.position?.line !== 'undefined' && typeof parsed?.position?.character !== 'undefined') {
        return offsetRange(parsed.position.line - 1, parsed.position.character)
    }
    if (typeof parsed?.position?.line !== 'undefined') {
        return offsetRange(parsed.position.line - 1, 0)
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

function offsetRange(line: number, character: number): vscode.Range {
    const position = new vscode.Position(line, character)
    return new vscode.Range(position, position)
}

function isSymbolicFilename(path: string): boolean {
    return !(path.endsWith('.md') || path.endsWith('.markdown') || path.endsWith('.txt') || path.endsWith('.log'))
}
