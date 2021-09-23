import open from 'open'
import * as vscode from 'vscode'
import { log } from '../log'
import { currentUserQuery } from '../queries/currentUserQuery'
import { endpointSetting } from './endpointSetting'
import { readConfiguration } from './readConfiguration'

let cachedAccessToken: Promise<string> | undefined

export function accessTokenSetting(): Promise<string> {
    const environmentVariable = process.env.SRC_ACCESS_TOKEN
    if (environmentVariable) {
        return Promise.resolve(environmentVariable)
    }

    const fromSettings = readConfiguration().get<string>('accessToken', '')
    if (fromSettings) {
        return Promise.resolve(fromSettings)
    }

    if (!cachedAccessToken) {
        cachedAccessToken = askUserToCreateAccessToken()
        cachedAccessToken.then(
            () => {},
            error => {
                log.error('askUserToCreateAccessToken', error)
                cachedAccessToken = undefined
            }
        )
    }
    return cachedAccessToken
}

async function askUserToCreateAccessToken(): Promise<string> {
    const openBrowserMessage = 'Open browser to create an access token'
    const learnMore = 'Learn more about access tokens'
    const userChoice = await vscode.window.showErrorMessage(
        'Missing Sourcegraph Access Token',
        {
            modal: true,
            detail: 'An access token is required to use the Sourcegraph extension. To fix this problem, create a new access token on the Sourcegraph website or set the $SRC_ACCESS_TOKEN environment variable and restart VS Code.',
        },
        openBrowserMessage,
        learnMore
    )
    const openUrl =
        userChoice === openBrowserMessage
            ? `${endpointSetting()}/user/settings/tokens`
            : userChoice === learnMore
            ? 'https://docs.sourcegraph.com/cli/how-tos/creating_an_access_token'
            : undefined
    if (openUrl) {
        await open(openUrl)
        const token = await vscode.window.showInputBox({
            title: 'Paste your Sourcegraph access token here',
            ignoreFocusOut: true,
        })
        if (token) {
            try {
                const currentUser = await currentUserQuery(token)
                log.appendLine(`Logged in successfully as '${currentUser}'`)
                await readConfiguration().update('accessToken', token, vscode.ConfigurationTarget.Global)
                return token
            } catch {
                await vscode.window.showErrorMessage(
                    "Invalid Access Token. To fix this problem, update the 'sourcegraph.accessToken' setting and try again"
                )
            }
        } else {
            log.error('askUserToCreateAccessToken - The user provided an empty access token')
        }
    } else {
        log.error('askUserToCreateAccessToken - The user decided not to open the browser')
    }
    throw new Error('No access token')
}
