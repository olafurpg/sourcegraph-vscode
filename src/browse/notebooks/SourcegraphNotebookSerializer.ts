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
                    part.kind === MarkdownPartKind.Markup
                        ? vscode.NotebookCellKind.Markup
                        : vscode.NotebookCellKind.Code,
                languageId: part.kind === MarkdownPartKind.Markup ? 'markdown' : 'sourcegraph',
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
            if (cell.kind === vscode.NotebookCellKind.Code) {
                parts.push(
                    new MarkdownPart(
                        MarkdownPartKind.CodeFence,
                        cell.value,
                        cell.metadata?.startBackticks || '```sourcegraph',
                        cell.metadata?.endBackticks || '```'
                    )
                )
            } else if (cell.kind === vscode.NotebookCellKind.Markup) {
                parts.push(new MarkdownPart(MarkdownPartKind.Markup, cell.value))
            }
        }
        return this.encoder.encode(new MarkdownFile(parts).renderAsString())
    }
}
