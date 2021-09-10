import { URL } from 'url'
import assert from 'assert'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'

function check(input: string, expected: ParsedRepoURI) {
    it(input, () => {
        const obtained = parseBrowserRepoURL(new URL(input))
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
})
