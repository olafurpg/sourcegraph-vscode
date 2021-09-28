import open from 'open'
import * as vscode from 'vscode'
import { log } from '../log'
import { currentUserQuery } from '../queries/currentUserQuery'
import { endpointSetting } from './endpointSetting'
import { readConfiguration } from './readConfiguration'

let cachedAccessToken: Promise<string> | undefined
const invalidAccessTokens = new Set<string>()

export function accessTokenSetting(): Promise<string> {
    const fromSettings = readConfiguration().get<string>('accessToken', '')
    if (fromSettings) {
        return Promise.resolve(fromSettings)
    }

    const environmentVariable = process.env.SRC_ACCESS_TOKEN
    if (environmentVariable && !invalidAccessTokens.has(environmentVariable)) {
        return Promise.resolve(environmentVariable)
    }

    return promptUserForAccessTokenSetting()
}

export async function deleteAccessTokenSetting(tokenValueToDelete: string): Promise<void> {
    invalidAccessTokens.add(tokenValueToDelete)
    const currentValue = readConfiguration().get<string>('accessToken')
    if (currentValue === tokenValueToDelete) {
        cachedAccessToken = undefined
        await readConfiguration().update('accessToken', undefined)
    }
}

export async function promptUserForAccessTokenSetting(title?: string): Promise<string> {
    if (!cachedAccessToken) {
        cachedAccessToken = unconditionallyPromptUserForAccessTokenSetting(title)
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
async function unconditionallyPromptUserForAccessTokenSetting(title?: string): Promise<string> {
    const openBrowserMessage = 'Open browser to create an access token'
    const learnMore = 'Learn more about access tokens'
    const pasteAccessToken = 'Paste existing access token'
    const userChoice = await vscode.window.showErrorMessage(
        title || 'Missing Sourcegraph Access Token',
        {
            modal: true,
            detail: 'An access token is required to use the Sourcegraph extension. To fix this problem, create a new access token on the Sourcegraph website or set the $SRC_ACCESS_TOKEN environment variable and restart VS Code.',
        },
        openBrowserMessage,
        learnMore,
        pasteAccessToken
    )
    if (userChoice) {
        const openUrl =
            userChoice === openBrowserMessage
                ? `${endpointSetting()}/user/settings/tokens`
                : userChoice === learnMore
                ? 'https://docs.sourcegraph.com/cli/how-tos/creating_an_access_token'
                : undefined
        if (openUrl) {
            await open(openUrl)
        }
        const token = await vscode.window.showInputBox({
            title: 'Paste your Sourcegraph access token here',
            ignoreFocusOut: true,
        })
        if (token) {
            try {
                const currentUser = await currentUserQuery(token)
                const successMessage = `Successfully logged into Sourcegraph as user '${currentUser}'`
                log.appendLine(successMessage)
                await vscode.window.showInformationMessage(successMessage)
                await readConfiguration().update('accessToken', token, vscode.ConfigurationTarget.Global)
                cachedAccessToken = undefined
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

export async function updateAccessTokenSetting(newValue?: string): Promise<void> {
    await readConfiguration().update('accessToken', newValue)
}
