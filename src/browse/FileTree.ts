import { ParsedRepoURI } from './parseRepoUrl'

export class FileTree {
    constructor(readonly uri: ParsedRepoURI, readonly files: string[]) {
        files.sort()
    }

    public directChildren(directory: string): string[] {
        const depth = this.depth(directory)
        const result = new Set<string>()
        const isRoot = directory === ''
        if (!isRoot && !directory.endsWith('/')) {
            directory = directory + '/'
        }
        // console.log(`DIRECTORY=${directory}`)
        for (const file of this.files) {
            // console.log(`file=${file} startsWith=${file.startsWith(directory)}`)
            if (file.startsWith(directory)) {
                const revision = this.uri.revision ? `@${this.uri.revision}` : ''
                const fileDepth = this.depth(file)
                const isDirect = isRoot ? fileDepth === 0 : fileDepth === depth + 1
                const path = isDirect ? file : file.slice(0, file.indexOf('/', directory.length))
                const kind = isDirect ? 'blob' : 'tree'
                result.add(
                    `${this.uri.url.protocol}//${this.uri.url.host}/${this.uri.repository}${revision}/-/${kind}/${path}`
                )
            }
        }
        return [...result]
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
