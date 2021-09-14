import { ParsedRepoURI } from './parseRepoUrl'

export class FileTree {
    constructor(readonly uri: ParsedRepoURI, readonly files: string[]) {
        files.sort()
    }
    public toString(): string {
        return `FileTree(${this.uri.url.toString()}, files.length=${this.files.length})`
    }

    // TODO: optimize this for very large repos like chromium/chromium. It's
    // usable in its current state but could be much faster if we use binary
    // search to skip unrelated paths.
    public directChildren(directory: string): string[] {
        const depth = this.depth(directory)
        const directFiles = new Set<string>()
        const directDirectories = new Set<string>()
        const isRoot = directory === ''
        if (!isRoot && !directory.endsWith('/')) {
            directory = directory + '/'
        }
        // console.log(`DIRECTORY=${directory}`)
        for (const file of this.files) {
            if (file === '') {
                continue
            }
            // console.log(`file=${file} startsWith=${file.startsWith(directory)}`)
            if (file.startsWith(directory)) {
                const revision = this.uri.revision ? `@${this.uri.revision}` : ''
                const fileDepth = this.depth(file)
                const isDirect = isRoot ? fileDepth === 0 : fileDepth === depth + 1
                const path = isDirect ? file : file.slice(0, file.indexOf('/', directory.length))
                const kind = isDirect ? 'blob' : 'tree'
                const uri = `sourcegraph://${this.uri.url.host}/${this.uri.repository}${revision}/-/${kind}/${path}`
                if (isDirect) directFiles.add(uri)
                else directDirectories.add(uri)
            }
        }
        return [...directDirectories, ...directFiles]
    }

    private depth(path: string): number {
        let result = 0
        for (const char of path) {
            if (char === '/') {
                result += 1
            }
        }
        return result
    }
}