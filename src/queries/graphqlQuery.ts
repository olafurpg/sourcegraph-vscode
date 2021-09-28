import { request, RequestOptions } from 'https'
import { CancellationToken } from 'vscode'
import { log } from '../log'
import { debugEnabledSetting } from '../settings/debugEnabledSetting'
import { endpointHostnameSetting, endpointSetting } from '../settings/endpointSetting'
import { accessTokenSetting, promptUserForAccessTokenSetting } from '../settings/accessTokenSetting'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
    return accessTokenSetting().then(accessToken => graphqlQueryWithAccessToken(query, variables, token, accessToken))
}

export function graphqlQueryWithAccessToken<A, B>(
    query: string,
    variables: A,
    token: CancellationToken,
    accessToken: string
): Promise<B | undefined> {
    accessToken = accessToken.trim()
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
        const curlCommand = (): string => {
            const data: string = JSON.stringify({ query: query.replace(/\s+/g, '  '), variables })
            return `curl -H 'Authorization: token ${accessToken}' -d '${data}' ${endpointSetting()}/.api/graphql`
        }
        const onReject = async (error: any) => {
            if (error === 'Invalid access token.\n') {
                // Prompt the user to update the access token setting and try again with the new setting.
                try {
                    const newToken = await promptUserForAccessTokenSetting('Invalid Sourcegraph Access Token')
                    const newResult = await graphqlQueryWithAccessToken<A, B>(query, variables, token, newToken)
                    resolve(newResult)
                } catch (newError) {
                    reject(newError)
                }
            } else {
                reject(error)
            }
        }
        const req = request(options, res => {
            const body: Uint8Array[] = []
            res.on('data', json => {
                body.push(json)
            })
            res.on('error', onReject)
            const onClose = () => {
                const json = Buffer.concat(body).toString()
                if (res.statusCode === 200) {
                    try {
                        const parsed: B = JSON.parse(json)
                        resolve(parsed)
                    } catch (error) {
                        log.error(`graphql(${curlCommand()})`, error)
                        onReject(error)
                    }
                } else {
                    log.error(`graphql(${curlCommand()}), statusCode=${res.statusCode}`, json)
                    onReject(json)
                }
            }
            res.on('close', onClose)
            res.on('end', onClose)
        })
        req.on('error', onReject)
        req.write(data)
        req.end()
        if (debugEnabledSetting()) {
            log.appendLine(curlCommand())
        }
        token.onCancellationRequested(() => {
            req.destroy()
        })
    })
}
