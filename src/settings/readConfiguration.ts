import * as vscode from 'vscode'
import { log } from '../log'

export function timed<T>(what: string, thunk: () => T): T {
    const start = Date.now()
    const result = thunk()
    const end = Date.now()
    const elapsedMilliseconds = end - start
    log.appendLine(`TIME ${what}: ${elapsedMilliseconds}ms`)
    return result
}

export function readConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('sourcegraph')
}
