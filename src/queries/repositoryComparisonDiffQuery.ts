import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export async function repositoryComparisonDiffQuery(
    parameters: RepositoryComparisonParameters,
    token: vscode.CancellationToken
): Promise<RepositoryComparisonNode[]> {
    const response = await graphqlQuery<RepositoryComparisonParameters, RepositoryComparisonResult>(
        gql`
            query RepositoryComparisonDiff(
                $repositoryId: ID!
                $base: String
                $head: String
                $first: Int
                $after: String
            ) {
                node(id: $repositoryId) {
                    ... on Repository {
                        comparison(base: $base, head: $head) {
                            fileDiffs(first: $first, after: $after) {
                                nodes {
                                    ...FileDiffFields
                                }
                                totalCount
                                diffStat {
                                    ...DiffStatFields
                                }
                            }
                        }
                    }
                }
            }

            fragment FileDiffFields on FileDiff {
                oldPath
                newPath
                stat {
                    added
                    changed
                    deleted
                }
            }

            fragment DiffStatFields on DiffStat {
                added
                changed
                deleted
            }
        `,
        parameters,
        token
    )
    return response?.data?.node?.comparison?.fileDiffs?.nodes || []
}

interface RepositoryComparisonResult {
    data?: {
        node?: {
            comparison?: {
                fileDiffs?: {
                    nodes?: RepositoryComparisonNode[]
                }
            }
        }
    }
}

export interface RepositoryComparisonNode {
    oldPath?: string
    newPath?: string
    stat?: {
        added?: number
        changed?: number
        deleted?: number
    }
}

export interface RepositoryComparisonParameters {
    repositoryId: string
    base: string
    head: string
    first: number
}
