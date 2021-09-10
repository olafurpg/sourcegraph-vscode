import { spawn } from 'child_process'
import { CancellationToken } from 'vscode'
import { log } from '../log'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
    return new Promise<B | undefined>((resolve, reject) => {
        const command: string[] = ['api', '-query', query, '-vars', JSON.stringify(variables)]
        log.appendLine(command.join(' '))
        const stdoutBuffer: string[] = []
        const proc = spawn('src', command)
        proc.on('data', chunk => {
            stdoutBuffer.push(chunk)
            log.appendLine(chunk)
        })
        const onExit = (exit: number) => {
            if (exit === 0) {
                const json = stdoutBuffer.join()
                const parsed: B = JSON.parse(json)
                resolve(parsed) // wrap in promise because this method will be async in the future
            } else {
                reject()
            }
        }
        proc.on('close', onExit)
        proc.on('disconnect', onExit)
        proc.on('error', onExit)
        proc.on('exit', onExit)
        token.onCancellationRequested(() => {
            proc.kill()
            reject()
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    })
}
