import * as vscode from 'vscode'
import graphqlQuery from './graphqlQuery'
import gql from 'tagged-template-noop'

export default async function contentQuery(
    parameters: ContentParameters,
    token: vscode.CancellationToken
): Promise<string | undefined> {
    const contentResult = await graphqlQuery<ContentParameters, ContentResult>(
        gql`
            query Content($repository: String!, $revision: String!, $path: String!) {
                repository(name: $repository) {
                    commit(rev: $revision) {
                        blob(path: $path) {
                            content
                        }
                    }
                }
            }
        `,
        parameters,
        token
    )
    return contentResult?.data?.repository?.commit?.blob?.content
}

interface ContentParameters {
    repository: string
    revision: string
    path: string
}

interface ContentResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    content?: string
                }
            }
        }
    }
}
