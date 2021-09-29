import { FilesTreeDataProvider } from '../file-system/FilesTreeDataProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'
import { log } from '../log'
import { GitReference, gitReferencesQuery } from '../queries/gitReferencesQuery'
import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'

export async function switchGitRevisionCommand(
    tree: FilesTreeDataProvider,
    uriString: string | undefined
): Promise<void> {
    const quick = new SourcegraphQuickPick(tree.fs)
    quick.pick.title = 'Search for a git branch, git tag or a git commit'
    const activeTextDocument = uriString ? SourcegraphUri.parse(uriString) : tree.activeTextDocument()
    if (!activeTextDocument || !activeTextDocument.path) {
        return
    }
    const activeTextDocumentPath = activeTextDocument.path
    const metadata = await tree.fs.repositoryMetadata(activeTextDocument.repositoryName)
    quick.onDidChangeValue(async query => {
        quick.pick.busy = true
        log.appendLine(`gitReferences: ${query.text}`)
        const references = await gitReferencesQuery(
            { query: query.text, repositoryId: metadata?.id || '' },
            query.token
        )
        log.appendLine(`gitReferences: ${query.text} ${JSON.stringify(references)}`)
        quick.pick.busy = false
        quick.pick.items = references.map(reference => ({
            label: gitReferenceTag(reference) + reference.displayName,
            uri: `sourcegraph://${activeTextDocument.host}${reference.url}/-/blob/${activeTextDocumentPath}`,
        }))
    })
    const uri = await quick.showQuickPickAndGetUserInput()
    await openSourcegraphUriCommand(tree.fs, uri)
}

function gitReferenceTag(reference: GitReference): string {
    switch (reference.type) {
        case 'GIT_TAG':
            return ' $(tag)'
        case 'GIT_BRANCH':
            return ' $(git-branch)'
        case 'GIT_COMMIT':
            return ' $(git-commit)'
        default:
            return ''
    }
}
