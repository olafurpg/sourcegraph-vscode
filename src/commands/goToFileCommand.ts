import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import SourcegraphFileSystemProvider from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'
import recentlyOpenFilesSetting from '../settings/recentlyOpenFilesSetting'

export default async function goToFileCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    const sg = new SourcegraphQuickPick(fs)
    sg.pick.title = 'Go to a file from the open Sourcegraph repositories'
    const recentlyOpenFiles = recentlyOpenFilesSetting.load()
    const fileItems = [...recentlyOpenFiles]
    sg.pick.items = fileItems
    sg.pick.busy = true
    fs.allFileFromOpenRepositories().then(allFiles => {
        for (const repo of allFiles) {
            for (const file of repo.fileNames) {
                if (file === '') {
                    continue
                }
                // Intentionally avoid using `SourcegraphUri.parse()` for
                // performance reasons.  This loop is a hot path for large
                // repositories like chromium/chromium with ~400k files.
                fileItems.push({
                    uri: `${repo.repositoryUri}/-/blob/${file}`,
                    label: file,
                    description: repo.repositoryName,
                })
            }
        }
        sg.pick.busy = false
        sg.pick.items = fileItems
    })
    const uri = await sg.showQuickPickAndGetUserInput()
    recentlyOpenFilesSetting.update(uri.uri)
    await openSourcegraphUriCommand(uri)
}
