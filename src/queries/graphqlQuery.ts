import { spawn } from 'child_process'
import { CancellationToken } from 'vscode'
import { IS_DEBUG_ENABLED } from '../extension'
import { log } from '../log'

export default function graphqlQuery<A, B>(
    query: string,
    variables: A,
    token: CancellationToken
): Promise<B | undefined> {
    return new Promise<B | undefined>((resolve, reject) => {
        const stdoutBuffer: string[] = []
        const onExit = (exit: number) => {
            if (exit === 0) {
                const json = stdoutBuffer.join('')
                try {
                    const parsed: B = JSON.parse(json)
                    resolve(parsed) // wrap in promise because this method will be async in the future
                } catch (error) {
                    reject(error)
                }
            } else {
                reject({ exit })
            }
        }
        const onData = (chunk: string) => {
            stdoutBuffer.push(chunk)
        }
        const command: string[] = [
            'api',
            '-query',
            query.trim().replace(/\n/g, ' ').replace(/ +/g, ' '),
            '-vars',
            JSON.stringify(variables),
        ]
        if (IS_DEBUG_ENABLED) {
            log.appendLine('src ' + command.map(part => `'${part}'`).join(' '))
        }
        const proc = spawn('src', command)
        proc.stdout.on('data', onData)
        proc.on('close', onExit)
        proc.on('disconnect', onExit)
        proc.on('error', onExit)
        proc.on('exit', onExit)
        token.onCancellationRequested(() => {
            if (!proc.killed) {
                proc.kill()
                reject()
            }
        })
    })
}
