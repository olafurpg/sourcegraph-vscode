import { URL } from 'url'
import assert from 'assert'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'

function check(input: string, expected: ParsedRepoURI) {
    it(input, () => {
        const obtained = parseBrowserRepoURL(new URL(input))
        assert.strictEqual(obtained, expected)
    })
}

describe('parseRepoUri', () => {
    check('git://jdk@v8/-/blob/java/lang/String.java', {
        repository: 'jdk',
        rawRevision: undefined,
        revision: 'v8',
        commitRange: undefined,
        commitID: '',
        path: 'java/lang/String.java',
        position: undefined,
        range: undefined,
    })
})
