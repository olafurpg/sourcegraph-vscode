import * as vscode from 'vscode'
import { graphqlQuery } from '../queries/graphqlQuery'
import { PositionParameters } from '../queries/PositionParameters'

export async function hoverQuery(
    parameters: PositionParameters,
    token: vscode.CancellationToken
): Promise<string | undefined> {
    const response = await graphqlQuery<PositionParameters, HoverResult>(HoverQuery, parameters, token)
    return response?.data?.repository?.commit?.blob?.lsif?.hover?.markdown?.text
}

interface HoverResult {
    data?: {
        repository?: {
            commit?: {
                blob?: {
                    lsif?: {
                        hover?: {
                            markdown?: {
                                text?: string
                            }
                            range?: Range
                        }
                    }
                }
            }
        }
    }
}

const HoverQuery = `
query Hover($repository: String!, $revision: String!, $path: String!, $line: Int!, $character: Int!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      blob(path: $path) {
        lsif {
          hover(line: $line, character: $character) {
            markdown {
              text
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
`
