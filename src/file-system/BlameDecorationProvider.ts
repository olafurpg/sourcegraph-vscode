import * as vscode from 'vscode'
export class BlameDecorationProvider implements vscode.FileDecorationProvider {
    private didChangeFileDecorations = new vscode.EventEmitter<vscode.Uri[]>()
    public onDidChangeFileDecorations?: vscode.Event<vscode.Uri[]> = this.didChangeFileDecorations.event
    public provideFileDecoration(uri: vscode.Uri, token: vscode.CancellationToken): Promise<vscode.FileDecoration> {
        throw new Error('Method not implemented.')
    }
}
