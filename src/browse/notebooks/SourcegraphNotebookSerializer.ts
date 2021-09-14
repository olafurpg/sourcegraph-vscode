import { TextDecoder, TextEncoder } from 'util'
import * as vscode from 'vscode'
import { log } from '../../log'
import { openFileCommand } from '../browseCommand'
import { search } from '../graphqlQuery'
import { SearchPatternType } from '../highlighting/scanner'
import { MarkdownFile, MarkdownPart, MarkdownPartKind } from './MarkdownFile'

export class SourcegraphNotebookSerializer implements vscode.NotebookSerializer {
    private readonly decoder = new TextDecoder()
    private readonly encoder = new TextEncoder()
    private readonly messageChannel = vscode.notebooks.createRendererMessaging('sourcegraph-location-renderer')
    private order = 0

    constructor() {
        const controller = vscode.notebooks.createNotebookController(
            'sourcegraph-notebook-controller-id',
            'sourcegraph-notebook',
            'Sourcegraph Notebook'
        )
        controller.supportedLanguages = ['sourcegraph']
        controller.supportsExecutionOrder = true
        controller.executeHandler = this.executeNotebook
        this.messageChannel.onDidReceiveMessage(event => {
            log.appendLine(`MESSAGE_CHANNEL ${JSON.stringify(event.message)}`)
            const uri = event.message?.uri
            if (event.message?.request === 'openEditor' && typeof uri === 'string') {
                openFileCommand(vscode.Uri.parse(uri))
            }
        })
    }

    public async executeNotebook(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController
    ): Promise<void> {
        const order = this.order
        for (const cell of cells) {
            const execution = controller.createNotebookCellExecution(cell)
            execution.executionOrder = ++this.order
            try {
                execution.start(Date.now())
                const results = await search(
                    'sourcegraph.com',
                    cell.document.getText(),
                    SearchPatternType.literal,
                    execution.token
                )
                const items: vscode.NotebookCellOutputItem[] = results.map((location, i) => {
                    const id = `execution-${i}-${order}`
                    const line = location.range.start.line + 1
                    const character = location.range.start.character
                    const uri = `${location.uri.toString(true)}?L${line}:${character}`
                    return new vscode.NotebookCellOutputItem(
                        new TextEncoder().encode(
                            JSON.stringify({
                                uri,
                                id,
                                html: `<button type='button' id='${id}'>${location.uri.path}?L${line}:${character}</button>`,
                            })
                        ),
                        'application/sourcegraph-location'
                    )
                })
                log.appendLine(`ITEMS ${JSON.stringify(items.length)}`)
                execution.replaceOutput(new vscode.NotebookCellOutput(items))
                execution.end(true, Date.now())
            } catch (error) {
                execution.replaceOutput(
                    new vscode.NotebookCellOutput([vscode.NotebookCellOutputItem.text(`ERROR: ${error}`)])
                )
                execution.end(false, Date.now())
            }
        }
    }

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
