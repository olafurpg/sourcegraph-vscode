import * as vscode from 'vscode'
import { spawn } from 'child_process'
import { CancellationToken } from 'vscode'
import { log } from '../log'
// import { log } from '../log'

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
                proc.kill()
                reject()
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    })
}

const RepositoryQuery = `
query RepositoriesForPopover($query: String, $first: Int) {
  repositories(first: $first, query: $query) {
    nodes {
      name
      isFork
    }
    totalCount
    pageInfo {
      hasNextPage
    }
  }
}
`
export async function repositories(query: string): Promise<string[]> {
    const result = await graphqlQuery<RepositoryParameters, RepositoryResult>(
        RepositoryQuery,
        {
            query,
            first: 10000,
        },
        new vscode.CancellationTokenSource().token
    )
    return result?.data?.repositories?.nodes?.filter(node => !node.isFork).map(node => node.name) || []
}

interface RepositoryParameters {
    query: string
    first: number
}

interface RepositoryResult {
    data?: {
        repositories?: {
            nodes?: RepositoryNode[]
        }
    }
    first: number
}
interface RepositoryNode {
    name: string
    isFork: boolean
}
