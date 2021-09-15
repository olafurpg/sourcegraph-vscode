import PositionParameters from './PositionParameters'
import * as vscode from 'vscode'
import graphqlQuery from './graphqlQuery'
import LocationNode from './LocationNode'

export default async function definitionQuery(
    parameters: PositionParameters,
    token: vscode.CancellationToken
): Promise<LocationNode[]> {
    const definition = await graphqlQuery<PositionParameters, DefinitionResult>(DefinitionQuery, parameters, token)
    return definition?.data?.repository?.commit?.blob?.lsif?.definitions?.nodes || []
}

interface DefinitionResult {
    data: {
        repository: {
            commit: {
                blob: {
                    lsif: {
                        definitions: {
                            nodes: LocationNode[]
                        }
                    }
                }
            }
        }
    }
}

const DefinitionQuery = `
query Definition($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          definitions(line: $line, character: $character) {
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
          }
        }
      }
    }
  }
}
`
