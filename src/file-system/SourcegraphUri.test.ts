import assert from 'assert'
import SourcegraphUri from './SourcegraphUri'

function check(input: string, expected: { repositoryName: string; revision: string; path: string }) {
    it(`parseBrowserRepoURL('${input})'`, () => {
        const obtained = SourcegraphUri.parse(input)
        assert.deepStrictEqual(obtained.repositoryName, expected.repositoryName)
        assert.deepStrictEqual(obtained.revision, expected.revision)
        assert.deepStrictEqual(obtained.path, expected.path)
    })
}

function checkParent(input: string, expected: string | undefined) {
    it(`checkParent('${input}')`, () => {
        const obtained = SourcegraphUri.parse(input).parentUri()
        assert.deepStrictEqual(obtained, expected)
    })
}

describe('parseRepoUri', () => {
    check('sourcegraph://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java', {
        repositoryName: 'jdk',
        revision: 'v8',
        path: 'java/lang/String.java',
    })
    checkParent(
        'sourcegraph://sourcegraph.com/jdk@v8/-/blob/java/lang/String.java',
        'sourcegraph://sourcegraph.com/jdk@v8/-/tree/java/lang'
    )
    checkParent(
        'sourcegraph://sourcegraph.com/github.com/sourcegraph@v8/-/blob/indexing/dependency_indexing_scheduler_test.go',
        'sourcegraph://sourcegraph.com/github.com/sourcegraph@v8/-/tree/indexing'
    )
    checkParent(
        'sourcegraph://sourcegraph.com/github.com/sourcegraph/-/blob/indexing/dependency_indexing_scheduler_test.go#L102:1',
        'sourcegraph://sourcegraph.com/github.com/sourcegraph/-/tree/indexing'
    )
    checkParent(
        'sourcegraph://sourcegraph.com/jdk@v8/-/tree/java/lang',
        'sourcegraph://sourcegraph.com/jdk@v8/-/tree/java'
    )
    checkParent('sourcegraph://sourcegraph.com/jdk@v8/-/tree/java', 'sourcegraph://sourcegraph.com/jdk@v8')
    checkParent('sourcegraph://sourcegraph.com/jdk@v8', undefined)
})
