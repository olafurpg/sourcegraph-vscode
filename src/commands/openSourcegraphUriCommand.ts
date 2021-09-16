import * as vscode from 'vscode'
import SourcegraphUri from '../file-system/SourcegraphUri'

export default async function openSourcegraphUriCommand(uri: SourcegraphUri): Promise<void> {
    const textDocument = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri.uri))
    const selection = getSelection(uri, textDocument)
    await vscode.window.showTextDocument(textDocument, {
        selection,
        viewColumn: vscode.ViewColumn.Active,
    })
}

function getSelection(uri: SourcegraphUri, textDocument: vscode.TextDocument): vscode.Range | undefined {
    if (typeof uri?.position?.line !== 'undefined' && typeof uri?.position?.character !== 'undefined') {
        return offsetRange(uri.position.line - 1, uri.position.character)
    }
    if (typeof uri?.position?.line !== 'undefined') {
        return offsetRange(uri.position.line - 1, 0)
    }
    if (uri.path && isSymbolicFilename(uri.path)) {
        const fileNames = uri.path.split('/')
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
