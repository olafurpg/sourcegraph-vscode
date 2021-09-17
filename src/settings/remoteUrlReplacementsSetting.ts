import vscode from 'vscode'

export function remoteUrlReplacementsSetting(): Record<string, string> {
    // has default value
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const replacements = vscode.workspace
        .getConfiguration('sourcegraph')
        .get<Record<string, string>>('remoteUrlReplacements')!
    return replacements
}
