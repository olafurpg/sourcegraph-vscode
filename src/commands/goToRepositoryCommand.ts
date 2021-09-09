import repositoriesQuery from '../queries/repositoriesQuery'

import SourcegraphFileSystemProvider from '../file-system/SourcegraphFileSystemProvider'
import SourcegraphUri from '../file-system/SourcegraphUri'
import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { BrowseQuickPickItem, SourcegraphQuickPick } from './SourcegraphQuickPick'
import recentlyOpenRepositoriesSetting from '../settings/recentlyOpenRepositoriesSetting'
import { endpointSetting } from '../settings/endpointSetting'

export default async function goToRepositoryCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    const sg = new SourcegraphQuickPick(fs)
    sg.pick.title = 'Type in a repository or paste a Sourcegraph URL'
    sg.pick.matchOnDescription = true
    sg.pick.matchOnDetail = true
    const recentlyOpenRepositories = recentlyOpenRepositoriesSetting.load()
    sg.pick.items = recentlyOpenRepositories
    const sourcegraphEndpoint = endpointSetting()
    sg.onDidChangeValue(async query => {
        if (query.text === '') {
            sg.pick.items = recentlyOpenRepositories
            return
        }
        if (query.text.startsWith(sourcegraphEndpoint)) {
            try {
                const uri = SourcegraphUri.parse(query.text)
                const item: BrowseQuickPickItem = {
                    uri: uri.uri,
                    label: recentlyOpenRepositoriesSetting.label(uri.repositoryName),
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
                label: recentlyOpenRepositoriesSetting.label(repo),
                uri: '',
                unresolvedRepositoryName: repo,
            }))
            sg.pick.items = [...queryItems, ...recentlyOpenRepositories]
            sg.pick.busy = false
        }
    })
    const uri = await sg.showQuickPickAndGetUserInput()
    recentlyOpenRepositoriesSetting.update({ label: uri.repositoryName, uri: uri.uri })
    await openSourcegraphUriCommand(uri)
}
