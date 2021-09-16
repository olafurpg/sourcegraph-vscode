import * as vscode from 'vscode'
import graphqlQuery from './graphqlQuery'
import gql from 'tagged-template-noop'

export default async function filesQuery(
    parameters: FilesParameters,
    token: vscode.CancellationToken
): Promise<string[]> {
    const result = await graphqlQuery<FilesParameters, FilesResult>(
        gql`
            query FileNames($repository: String!, $revision: String!) {
                repository(name: $repository) {
                    commit(rev: $revision) {
                        fileNames
                    }
                }
            }
        `,
        parameters,
        new vscode.CancellationTokenSource().token
    )
    return result?.data?.repository?.commit?.fileNames || []
}

interface FilesParameters {
    repository: string
    revision: string
}

interface FilesResult {
    data?: {
        repository?: {
            commit?: {
                fileNames?: string[]
            }
        }
    }
}
