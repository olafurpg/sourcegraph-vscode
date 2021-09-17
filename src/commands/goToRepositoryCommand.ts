import repositoriesQuery from '../queries/repositoriesQuery'

import SourcegraphFileSystemProvider from '../file-system/SourcegraphFileSystemProvider'
import SourcegraphUri from '../file-system/SourcegraphUri'
import { log } from '../log'
import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { BrowseQuickPickItem, SourcegraphQuickPick } from './SourcegraphQuickPick'
import recentlyVisitedRepositoriesSetting from '../settings/recentlyVisitedRepositoriesSetting'

export default async function goToRepositoryCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const sg = new SourcegraphQuickPick(fs)
        sg.pick.title = 'Type in a repository or paste a Sourcegraph URL'
        sg.pick.matchOnDescription = true
        sg.pick.matchOnDetail = true
        const recentlyVisitedRepositories = recentlyVisitedRepositoriesSetting.load()
        sg.pick.items = recentlyVisitedRepositories
        sg.onDidChangeValue(async query => {
            if (query.text === '') {
                sg.pick.items = recentlyVisitedRepositories
                return
            }
            if (query.text.startsWith('https://sourcegraph.com')) {
                try {
                    const uri = SourcegraphUri.parse(query.text)
                    const item: BrowseQuickPickItem = {
                        uri: uri.uri,
                        label: recentlyVisitedRepositoriesSetting.label(uri.repositoryName),
                        description: uri.path,
                        unresolvedRepositoryName: uri.repositoryName,
                        detail: query.text,
                    }
                    sg.pick.items = [item]
                } catch (_error) {
                    // TODO: report helpful error message
                }
                return
            }
            sg.pick.busy = true
            const repos = await repositoriesQuery(query.text, query.token)
            if (!query.token.isCancellationRequested) {
                const queryItems: BrowseQuickPickItem[] = repos.map(repo => ({
                    label: recentlyVisitedRepositoriesSetting.label(repo),
                    uri: '',
                    unresolvedRepositoryName: repo,
                }))
                sg.pick.items = [...queryItems, ...recentlyVisitedRepositories]
                sg.pick.busy = false
            }
        })
        const uri = await sg.showQuickPickAndGetUserInput()
        recentlyVisitedRepositoriesSetting.update({ label: uri.repositoryName, uri: uri.uri })
        await openSourcegraphUriCommand(uri)
    } catch (error) {
        if (typeof error !== 'undefined') {
            log.appendLine(`ERROR - goToRepositoryCommand: ${error}`)
        }
    }
}
