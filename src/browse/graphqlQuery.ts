import { spawn } from 'child_process'
import { CancellationToken } from 'vscode'
import { log } from '../log'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
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
        const command: string[] = ['api', '-query', query.replace(/\n/g, ' '), '-vars', JSON.stringify(variables)]
        log.appendLine('src ' + command.map(part => `'${part}'`).join(' '))
        const proc = spawn('src', command)
        proc.stdout.on('data', onData)
        proc.on('close', onExit)
        proc.on('disconnect', onExit)
        proc.on('error', onExit)
        proc.on('exit', onExit)
        token.onCancellationRequested(() => {
            if (!proc.killed) {
                log.appendLine('KILL')
                proc.kill()
                reject()
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    })
}
