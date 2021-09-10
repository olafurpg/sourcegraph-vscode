import { URL } from 'url'
import assert from 'assert'
import { parseBrowserRepoURL, ParsedRepoURI } from './parseRepoUrl'
import { spawn } from 'child_process'

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
    it('execFile', async () => {
        const out = new Promise<string>((resolve, reject) => {
            const buffer: string[] = []
            const proc = spawn('src', [])
            proc.on('data', chunk => {
                buffer.push(chunk)
            })
            const onExit = (exit: number) => {
                console.log('exit ' + exit)
                resolve(buffer.join(' a '))
            }
            proc.on('disconnect', onExit)
            proc.on('close', onExit)
            proc.on('exit', onExit)
        })
        const myString = await out
        console.log(myString)
        assert.strictEqual(myString, 'a')
    })
})
