import { DiffsTreeDataProvider } from '../file-system/DiffsTreeDataProvider'
import { log } from '../log'
import { gitReferencesQuery } from '../queries/gitReferencesQuery'
import { endpointHostnameSetting } from '../settings/endpointSetting'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'
import { gitReferenceTag } from './switchGitRevisionCommand'

export async function updateCompareRange(diffs: DiffsTreeDataProvider, commandArguments: any[]): Promise<void> {
    const repositoryName: string = commandArguments[0]
    if (typeof repositoryName !== 'string') {
        log.error(`updateCompareRange(${JSON.stringify(arguments)})`, `first argument is not a string`)
        throw new Error(`updateCompareRange(${JSON.stringify(arguments)})`)
    }
    const kind: 'base' | 'head' = commandArguments[1]
    if (kind !== 'base' && kind !== 'head') {
        log.error(`updateCompareRange(${JSON.stringify(arguments)})`, `second argument is not 'base' or 'head'`)
        throw new Error(`updateCompareRange(${JSON.stringify(arguments)})`)
    }
    const quick = new SourcegraphQuickPick(diffs.fs)
    quick.pick.title = 'Search for a git branch, git tag or a git commit'
    const metadata = await diffs.fs.repositoryMetadata(repositoryName)
    quick.onDidChangeValue(async query => {
        quick.pick.busy = true
        const references = await gitReferencesQuery(
            { query: query.text, repositoryId: metadata?.id || '' },
            query.token
        )
        quick.pick.busy = false
        quick.pick.items = references.map(reference => ({
            label: gitReferenceTag(reference) + reference.displayName,
            uri: `sourcegraph://${endpointHostnameSetting()}${reference.url}`,
        }))
    })
    const uri = await quick.showQuickPickAndGetUserInput()
    diffs.updateCompareRange(repositoryName, kind, uri.revision)
}
