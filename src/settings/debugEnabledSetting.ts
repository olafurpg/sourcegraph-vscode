import * as vscode from 'vscode'

export default vscode.workspace.getConfiguration('sourcegraph').get<boolean>('debug', false)
