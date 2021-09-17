import * as vscode from 'vscode'

export default function readConfiguration() {
    return vscode.workspace.getConfiguration('sourcegraph')
}
