import * as vscode from 'vscode'
import { getCompletionItems } from '../highlighting/completion'
import { scanSearchQuery, SearchPatternType } from '../highlighting/scanner'

export default class SourcegraphCompletionItemProvider implements vscode.CompletionItemProvider {
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionList | null> {
        const scanned = scanSearchQuery(document.getText(), true, SearchPatternType.literal)
        if (scanned.type === 'success') {
            const items = await getCompletionItems(scanned.term, position, true, true)
            return items
        }
        return null
    }
}
