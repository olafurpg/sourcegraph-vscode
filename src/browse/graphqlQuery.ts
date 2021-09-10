import { execSync } from 'child_process'
import { log } from '../log'

export function graphqlQuery<A, B>(query: string, variables: A): Promise<B | undefined> {
    const apiArguments: string[] = []
    for (const key in variables) {
        if (Object.prototype.hasOwnProperty.call(variables, key)) {
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            apiArguments.push(`'${key}=${variables[key]}'`)
        }
    }
    const command = `src api -query='${query.replace(/\n/g, ' ')}' ${apiArguments.join(' ')}`
    log.appendLine(command)
    // TODO: do direct HTTP query to the GraphQL API instead of shelling out to src.
    const json = execSync(command).toString()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: B = JSON.parse(json)
    return Promise.resolve(parsed) // wrap in promise because this method will be async in the future
}
