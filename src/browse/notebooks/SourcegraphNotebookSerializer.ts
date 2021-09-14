import { TextDecoder, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { MarkdownFile, MarkdownPart, MarkdownPartKind } from './MarkdownFile'

export class SourcegraphNotebookSerializer implements vscode.NotebookSerializer {
    private readonly decoder = new TextDecoder()
    private readonly encoder = new TextEncoder()

    public deserializeNotebook(data: Uint8Array, token: vscode.CancellationToken): vscode.NotebookData {
        const content = this.decoder.decode(data)
        const file = MarkdownFile.parseContent(content)
        const cells: vscode.NotebookCellData[] = []
        for (const part of file.parts) {
            cells.push({
                kind:
                    part.kind === MarkdownPartKind.MARKUP
                        ? vscode.NotebookCellKind.Markup
                        : vscode.NotebookCellKind.Code,
                languageId: part.kind === MarkdownPartKind.MARKUP ? 'markdown' : 'sourcegraph',
                metadata: {
                    startBackticks: part.startBackticks,
                    endBackticks: part.endBackticks,
                },
                value: part.value,
            })
        }
        return { cells }
    }
    public serializeNotebook(data: vscode.NotebookData, token: vscode.CancellationToken): Uint8Array {
        const parts: MarkdownPart[] = []
        for (const cell of data.cells) {
            const kind =
                cell.kind === vscode.NotebookCellKind.Code ? MarkdownPartKind.CODE_FENCE : MarkdownPartKind.MARKUP
            const startBackticks: string = cell.metadata?.startBackticks
            const endBackticks: string = cell.metadata?.endBackticks
            parts.push(new MarkdownPart(kind, cell.value, startBackticks, endBackticks))
        }
        return this.encoder.encode(new MarkdownFile(parts).renderAsString())
    }
}
