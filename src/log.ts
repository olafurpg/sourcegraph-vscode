import vscode from 'vscode'

const outputChannel = vscode.window.createOutputChannel('Sourcegraph')
export default {
    error: (what: string, error?: any): void => {
        let errorMessage =
            error instanceof Error ? ` ${error.message} ${error.stack}` : error === undefined ? '' : ` ${error}`
        outputChannel.appendLine(`ERROR ${what}${errorMessage}`)
    },
    appendLine: (message: string): void => {
        outputChannel.appendLine(message)
    },
}
