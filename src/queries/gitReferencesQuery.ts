import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export interface GitReference {
    displayName: string
    name: string
    url: string
    type: string
}

export async function gitReferencesQuery(
    parameters: GitReferencesParameters,
    token: vscode.CancellationToken
): Promise<GitReference[]> {
    const result = await graphqlQuery<GitReferencesParameters, GitReferencesResult>(
        gql`
            query RepositoryGitRefs($repositoryId: ID!, $query: String) {
                node(id: $repositoryId) {
                    __typename
                    ... on Repository {
                        gitRefs(first: 100, query: $query, orderBy: AUTHORED_OR_COMMITTED_AT) {
                            __typename
                            ...GitRefConnectionFields
                        }
                        __typename
                    }
                }
            }

            fragment GitRefConnectionFields on GitRefConnection {
                nodes {
                    __typename
                    ...GitRefFields
                }
            }

            fragment GitRefFields on GitRef {
                displayName
                name
                url
                type
            }
        `,
        parameters,
        token
    )
    return result?.data?.node?.gitRefs?.nodes || []
}

interface GitReferencesParameters {
    repositoryId: string
    query: string
}
interface GitReferencesResult {
    data?: {
        node?: {
            gitRefs?: {
                nodes?: GitReference[]
            }
        }
    }
}
