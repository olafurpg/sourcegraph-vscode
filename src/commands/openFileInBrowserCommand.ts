import open from 'open'
import { SourcegraphTreeDataProvider } from '../file-system/SourcegraphTreeDataProvider'
import { SourcegraphUri } from '../file-system/SourcegraphUri'

export async function openFileInBrowserCommand(
    tree: SourcegraphTreeDataProvider,
    uriString: string | undefined
): Promise<void> {
    const activeTextDocument = uriString ? SourcegraphUri.parse(uriString) : tree.activeTextDocument()
    if (!activeTextDocument || !activeTextDocument.path) {
        return
    }

    await open(activeTextDocument.uri.replace('sourcegraph://', 'https://'))
}
