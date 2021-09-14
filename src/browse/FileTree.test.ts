import assert from 'assert'
import { URL } from 'url'
import { FileTree } from './FileTree'
import { parseBrowserRepoURL } from './parseRepoUrl'
const tree = new FileTree(parseBrowserRepoURL(new URL('https://sourcegraph.com/sourcegraph-vscode@v8')), [
    '.eslintrc.json',
    '.github/workflows/build.yml',
    '.gitignore',
    '.vscode/extensions.json',
    '.vscode/launch.json',
    '.vscode/settings.json',
    '.vscode/tasks.json',
    '.vscodeignore',
    'README.md',
    'images/logo.png',
    'renovate.json',
    'src/browse/BrowseFileSystemProvider.ts',
    'src/browse/browseCommand.ts',
    'src/browse/graphqlQuery.ts',
    'src/browse/parseRepoUri.test.ts',
    'src/browse/parseRepoUrl.ts',
    'src/config.ts',
    'src/extension.ts',
    'src/git/helpers.ts',
    'src/git/index.ts',
    'src/git/remoteNameAndBranch.test.ts',
    'src/git/remoteNameAndBranch.ts',
    'src/git/remoteUrl.test.ts',
    'src/git/remoteUrl.ts',
    'src/log.ts',
    'tsconfig.json',
])

function checkChildren(directory: string, expected: string[]) {
    it(`directChildren('${directory}')`, () => {
        const childUris = tree.directChildren(directory)
        const obtained: string[] = []
        for (const uri of childUris) {
            const parsed = parseBrowserRepoURL(new URL(uri))
            if (parsed.path) {
                const path = uri.includes('/tree/') ? parsed.path + `/` : parsed.path
                obtained.push(path)
            }
        }
        assert.deepStrictEqual(obtained, expected)
    })
}
describe('FileTree', () => {
    checkChildren('src', ['src/browse/', 'src/config.ts', 'src/extension.ts', 'src/git/', 'src/log.ts'])
    checkChildren('', [
        '.eslintrc.json',
        '.github/',
        '.gitignore',
        '.vscode/',
        '.vscodeignore',
        'README.md',
        'images/',
        'renovate.json',
        'src/',
        'tsconfig.json',
    ])
})