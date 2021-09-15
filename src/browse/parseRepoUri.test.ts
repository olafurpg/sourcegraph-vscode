import assert from 'assert'
import { SourcegraphUri } from './parseRepoUrl'

function check(input: string, expected: { repository: string; revision: string; path: string }) {
    it(`parseBrowserRepoURL('${input})'`, () => {
        const obtained = SourcegraphUri.parse(input)
        assert.deepStrictEqual(obtained.repository, expected.repository)
        assert.deepStrictEqual(obtained.revision, expected.revision)
        assert.deepStrictEqual(obtained.path, expected.path)
    })
}

function checkParent(input: string, expected: string | undefined) {
    it(`checkParent('${input}')`, () => {
        const obtained = SourcegraphUri.parse(input).parent()
        assert.deepStrictEqual(obtained, expected)
    })
}

describe('parseRepoUri', () => {
    check('https://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java', {
        repository: 'jdk',
        revision: 'v8',
        path: 'java/lang/String.java',
    })
    checkParent(
        'https://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java',
        'https://sourcegraph.com/jdk@v8/-/tree/java/lang'
    )
    checkParent(
        'https://sourcegraph.com/github.com/sourcegraph@v8/-/blob/indexing/dependency_indexing_scheduler_test.go',
        'https://sourcegraph.com/github.com/sourcegraph@v8/-/tree/indexing'
    )
    checkParent(
        'https://sourcegraph.com/github.com/sourcegraph/-/blob/indexing/dependency_indexing_scheduler_test.go#L102:1',
        'https://sourcegraph.com/github.com/sourcegraph/-/tree/indexing'
    )
    checkParent('https://sourcegraph.com/jdk@v8/-/tree/java/lang', 'https://sourcegraph.com/jdk@v8/-/tree/java')
    checkParent('https://sourcegraph.com/jdk@v8/-/tree/java', 'https://sourcegraph.com/jdk@v8')
    checkParent('https://sourcegraph.com/jdk@v8', undefined)
})
