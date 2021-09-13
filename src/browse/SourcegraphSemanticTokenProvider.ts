import * as vscode from 'vscode'
import { log } from '../log'
export class SourcegraphSemanticTokenProvider
    implements vscode.DocumentSemanticTokensProvider, vscode.SemanticTokensLegend {
    tokenTypes: string[] = ['type']
    tokenModifiers: string[] = []
    onDidChangeSemanticTokens?: vscode.Event<void> | undefined
    provideDocumentSemanticTokens(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.SemanticTokens {
        log.appendLine(`SEMANTIC_TOKENS: ${document.uri.toString(true)} ${document.getText()}`)
        const builder = new vscode.SemanticTokensBuilder()
        const lang = /lang:/.exec(document.getText())
        const index = lang?.index
        if (index) {
            const start = document.positionAt(index)
            const end = document.positionAt(index + 'lang'.length)
            const range = new vscode.Range(start, end)
            log.appendLine(`KEYWORD ${document.getText(range)}`)
            builder.push(range, 'type')
        }
        return builder.build()
    }
}
