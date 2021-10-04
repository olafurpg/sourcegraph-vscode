/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as vscode from 'vscode'
import { DiffsTreeDataProvider } from '../file-system/DiffsTreeDataProvider'
import { emptyCancelationToken } from '../file-system/emptyCancelationToken'
import { CompareRange, SourcegraphUri } from '../file-system/SourcegraphUri'
import { log } from '../log'
import { resolveRevisionQuery } from '../queries/resolveRevisionQuery'

export interface GoToCommitParameters {
    revision: string
    uri: string
    line: number
}

export async function goToCommitCommand(diffs: DiffsTreeDataProvider, commandArguments: any[]): Promise<void> {
    try {
        const parameters: GoToCommitParameters = commandArguments[0]
        if (typeof parameters.revision !== 'string') {
            throw new TypeError('.commit is not a string')
        }
        if (typeof parameters.uri !== 'string') {
            throw new TypeError('.uri is not a string')
        }
        if (typeof parameters.line !== 'number') {
            throw new TypeError('.line is not a number')
        }
        const uri = SourcegraphUri.parse(parameters.uri)
        const baseRevisionSpec = `${parameters.revision}~1`
        const headRevision = parameters.revision
        const baseRevision = await resolveRevisionQuery(
            { repositoryName: uri.repositoryName, revision: baseRevisionSpec },
            emptyCancelationToken()
        )
        if (!baseRevision) {
            throw new Error(`unable to resolve revision ${baseRevisionSpec}`)
        }
        const base = vscode.Uri.parse(uri.withRevision(baseRevision).uri)
        const head = vscode.Uri.parse(uri.withRevision(headRevision).uri)
        const revisionRange: CompareRange = { base: baseRevision, head: headRevision }
        const title = diffs.diffTitle(uri.basename(), revisionRange)
        // The vscode.diff command supports revealing a specific range. Example
        // https://sourcegraph.com/github.com/microsoft/vscode@bde7d28924dc3192ab95c6fed193ae91b821f773/-/blob/extensions/git/src/commands.ts?L2650:105
        const options: vscode.TextDocumentShowOptions = {
            selection: await revealRange(parameters, vscode.Uri.parse(uri.uri), head),
        }
        await vscode.commands.executeCommand('vscode.diff', base, head, title, options)
        diffs.updateCompareRange(uri.repositoryName, revisionRange)
    } catch (error) {
        log.error(`goToCommitCommand(${JSON.stringify(commandArguments)})`, error)
    }
}

// Returns the range in the `head` document that should be revealed when opening
// the VS Code diff editor.  This range is computed with a heuristic: we reveal
// the first line that has the same text contents in both files.  This method
// returns false positive results when multiple lines in either document have
// the exact same text contents (which can totally happen). It would be nice to
// improve this heuristic better, maybe git can provide this information
// directly?
async function revealRange(
    parameters: GoToCommitParameters,
    uri: vscode.Uri,
    head: vscode.Uri
): Promise<vscode.Range | undefined> {
    const originalTextDocument = await vscode.workspace.openTextDocument(uri)
    const textSearch = originalTextDocument.getText(new vscode.Range(parameters.line, 0, parameters.line, 1000))
    const headTextDocument = await vscode.workspace.openTextDocument(head)
    const revealLine = headTextDocument
        .getText()
        .split(/\n\r?/)
        .findIndex(line => line === textSearch)
    return revealLine > 0 ? new vscode.Range(revealLine, 0, revealLine, 1000) : undefined
}
