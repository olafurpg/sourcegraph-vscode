import { URL } from 'url'
import assert from 'assert'
import { parseBrowserRepoURL, ParsedRepoURI, repoUriParent } from './parseRepoUrl'

function check(input: string, expected: Omit<ParsedRepoURI, 'url'>) {
    it(`parseBrowserRepoURL('${input})'`, () => {
        const obtained = parseBrowserRepoURL(new URL(input))
        assert.deepStrictEqual(obtained, {
            url: new URL(input),
            ...expected,
        })
    })
}

function checkParent(input: string, expected: string | undefined) {
    it(`checkParent('${input}')`, () => {
        const obtained = repoUriParent(input)
        assert.deepStrictEqual(obtained, expected)
    })
}

describe('parseRepoUri', () => {
    check('https://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java', {
        repository: 'jdk',
        rawRevision: 'v8',
        revision: 'v8',
        commitRange: undefined,
        commitID: undefined,
        path: 'java/lang/String.java',
        position: undefined,
        range: undefined,
    })
    checkParent(
        'https://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java',
        'https://sourcegraph.com/jdk@v8/-/tree/java/lang'
    )
    checkParent('https://sourcegraph.com/jdk@v8/-/tree/java/lang', 'https://sourcegraph.com/jdk@v8/-/tree/java')
    checkParent('https://sourcegraph.com/jdk@v8/-/tree/java', 'https://sourcegraph.com/jdk@v8')
    checkParent('https://sourcegraph.com/jdk@v8', 'https://sourcegraph.com')
    checkParent('https://sourcegraph.com', undefined)
})
