import openSourcegraphUriCommand from './openSourcegraphUriCommand'
import { log } from '../log'
import SourcegraphFileSystemProvider from '../file-system/SourcegraphFileSystemProvider'
import { SourcegraphQuickPick } from './SourcegraphQuickPick'
import recentlyVisitedFilesSetting from '../settings/recentlyVisitedFilesSetting'

export default async function goToFileCommand(fs: SourcegraphFileSystemProvider): Promise<void> {
    try {
        const sg = new SourcegraphQuickPick(fs)
        sg.pick.title = 'Go to a file from the open Sourcegraph repositories'
        const recentlyVisitedFiles = recentlyVisitedFilesSetting.load()
        const fileItems = [...recentlyVisitedFiles]
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
        recentlyVisitedFilesSetting.update(uri.uri)
        await openSourcegraphUriCommand(uri)
    } catch (error) {
        if (typeof error !== 'undefined') {
            log.appendLine(`ERROR - goToFileCommand: ${error}`)
        }
    }
}
