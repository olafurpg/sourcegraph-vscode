import { URL } from 'url'
import * as vscode from 'vscode'
import { log } from '../log'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'

export async function browseCommand(): Promise<void> {
    const clipboard = await vscode.env.clipboard.readText()
    const value =
        clipboard.startsWith('https://sourcegraph.com') || clipboard.startsWith('https://github.com') ? clipboard : ''
    const input = await vscode.window.showInputBox({ value })

    if (input) {
        const uri = input
            .replace('https://github.com', 'https://sourcegraph/github.com')
            .replace('https://', 'sourcegraph://')
        await openFileCommand(vscode.Uri.parse(uri))
    }
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
    log.appendLine(
        `SELECTION uri=${parsed.url} position=${JSON.stringify(parsed.position)} text=${textDocument.getText().length}`
    )
    if (parsed?.position?.line && parsed?.position?.character) {
        return offsetRange(parsed.position.line - 1, parsed.position.character)
    }
    if (parsed.path && isSymbolicFilename(parsed.path)) {
        const fileNames = parsed.path.split('/')
        const fileName = fileNames[fileNames.length - 1]
        const symbolName = fileName.split('.')[0]
        const text = textDocument.getText()
        const symbolMatches = new RegExp(` ${symbolName}\\b`).exec(text)
        log.appendLine(`REGEXP fileName=${textDocument.fileName} symbolName=${symbolName} ${symbolMatches}`)
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
