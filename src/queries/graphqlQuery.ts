import { request, RequestOptions } from 'https'
import { CancellationToken } from 'vscode'
import { log } from '../log'
import { debugEnabledSetting } from '../settings/debugEnabledSetting'
import { endpointHostnameSetting } from '../settings/endpointSetting'
import { accessTokenSetting } from '../settings/accessTokenSetting'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
    return accessTokenSetting().then(accessToken => graphqlQueryWithAccessToken(query, variables, token, accessToken))
}

export function graphqlQueryWithAccessToken<A, B>(
    query: string,
    variables: A,
    token: CancellationToken,
    accessToken: string
): Promise<B | undefined> {
    log.appendLine(`accessToken ${accessToken}`)
    return new Promise<B | undefined>((resolve, reject) => {
        const data = JSON.stringify({
            query,
            variables,
        })
        const options: RequestOptions = {
            hostname: endpointHostnameSetting(),
            port: 443,
            path: '/.api/graphql',
            method: 'POST',
            headers: {
                Authorization: `token ${accessToken}`,
                'Content-Length': data.length,
            },
        }
        const req = request(options, res => {
            const body: Uint8Array[] = []
            res.on('data', json => {
                body.push(json)
            })
            res.on('error', reject)
            const onClose = () => {
                if (res.statusCode === 200) {
                    try {
                        const json = Buffer.concat(body).toString()
                        const parsed: B = JSON.parse(json)
                        resolve(parsed)
                    } catch (error) {
                        log.error(`graphql(${data})`, error)
                        reject(error)
                    }
                } else {
                    log.error(`graphql(${data}), statusCode=${res.statusCode}`, body)
                    reject(body.join(''))
                }
            }
            res.on('close', onClose)
            res.on('end', onClose)
        })
        req.on('error', reject)
        req.write(data)
        req.end()
        if (debugEnabledSetting()) {
            const command: string[] = [
                'api',
                '-query',
                query.trim().replace(/\n/g, ' ').replace(/ +/g, ' '),
                '-vars',
                JSON.stringify(variables),
            ]
            log.appendLine('src ' + command.map(part => `'${part}'`).join(' '))
        }
        token.onCancellationRequested(() => {
            req.destroy()
        })
    })
}
