import * as vscode from 'vscode'
import { SourcegraphFileSystemProvider } from './SourcegraphFileSystemProvider'
export class BlameDecorationProvider {
    constructor(public readonly fs: SourcegraphFileSystemProvider) {}
    private cancelToken = new vscode.CancellationTokenSource()
    public async onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        this.cancelToken.cancel()
        this.cancelToken = new vscode.CancellationTokenSource()
        await this.onCancelableDidChangeTextEditorSelection(event, this.cancelToken.token)
    }

    private onCancelableDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent,
        token: vscode.CancellationToken
    ): Promise<void> {
        return Promise.resolve()
    }
}
