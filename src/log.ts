import vscode from 'vscode'

const outputChannel = vscode.window.createOutputChannel('Sourcegraph')
export const log = {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    error: (what: string, error?: any): void => {
        const errorMessage =
            error instanceof Error
                ? ` ${error.message} ${error.stack || ''}`
                : error !== undefined
                ? ` ${JSON.stringify(error)}`
                : ''
        outputChannel.appendLine(`ERROR ${what}${errorMessage}`)
    },
    appendLine: (message: string): void => {
        outputChannel.appendLine(message)
    },
}
