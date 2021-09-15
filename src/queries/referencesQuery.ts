import * as vscode from 'vscode'
import graphqlQuery from '../queries/graphqlQuery'
import PositionParameters from '../queries/PositionParameters'
import LocationNode from '../queries/LocationNode'

export default async function referencesQuery(
    parameters: PositionParameters,
    token: vscode.CancellationToken
): Promise<LocationNode[]> {
    const response = await graphqlQuery<PositionParameters, ReferencesResult>(
        `
query References($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!, $after: String) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          references(line: $line, character: $character, after: $after) {
            nodes {
              resource {
                path
                repository {
                  name
                }
                commit {
                  oid
                }
              }
              range {
                start {
                  line
                  character
                }
                end {
                  line
                  character
                }
              }
            }
            pageInfo {
              endCursor
            }
          }
        }
      }
    }
  }
}
`,

        parameters,
        token
    )
    return response?.data?.repository?.commit?.blob?.lsif?.references?.nodes || []
}

interface ReferencesResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    lsif?: {
                        references?: {
                            nodes?: LocationNode[]
                        }
                    }
                }
            }
        }
    }
}
