import * as vscode from 'vscode'
import { log } from '../log'
import { getCompletionItems } from './highlighting/completion'
import { scanSearchQuery, SearchPatternType } from './highlighting/scanner'
export class SourcegraphCompletionItemProvider implements vscode.CompletionItemProvider {
    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionList | null> {
        const scanned = scanSearchQuery(document.getText(), true, SearchPatternType.literal)
        if (scanned.type === 'success') {
            const items = await getCompletionItems(scanned.term, position, true, true)
            for (const item of items?.items || []) {
                log.appendLine(`COMPLETION ITEM ${JSON.stringify(item)}`)
            }
            return items
        }
        return null
    }
}
