import vscode from 'vscode'

export function defaultBranchSetting(): string {
    // has default value
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const branch = vscode.workspace.getConfiguration('sourcegraph').get<string>('defaultBranch')!

    return branch
}
