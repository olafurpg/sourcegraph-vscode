import { openSourcegraphUriCommand } from './openSourcegraphUriCommand'
import { SourcegraphFileSystemProvider } from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'
import { recentlyOpenFilesSetting } from '../settings/recentlyOpenFilesSetting'
import { log } from '../log'

export async function goToFileCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    const quick = new SourcegraphQuickPick(fs)
    quick.pick.title = 'Go to a file from the open Sourcegraph repositories'
    const recentlyOpenFiles = recentlyOpenFilesSetting.load()
    const fileItems = [...recentlyOpenFiles]
    quick.pick.items = fileItems
    quick.pick.busy = true
    fs.allFileFromOpenRepositories().then(
        allFiles => {
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
            quick.pick.busy = false
            quick.pick.items = fileItems
        },
        error => log.error('fs.allFileFromOpenRepositories', error)
    )
    const uri = await quick.showQuickPickAndGetUserInput()
    await recentlyOpenFilesSetting.update(uri.uri)
    await openSourcegraphUriCommand(fs, uri)
}
