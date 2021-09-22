import * as vscode from 'vscode'
import { SearchPatternType } from '../search/scanner'
import { graphqlQuery } from './graphqlQuery'
import gql from 'tagged-template-noop'

export function searchQueryResult(
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<SearchResult | undefined> {
    return graphqlQuery<SearchParameters, SearchResult>(
        gql`
            query Search($query: String!) {
                search(query: $query, patternType: ${SearchPatternType[patternType]}) {
                    results {
                        results {
                            ... on FileMatch {
                                ...FileMatchFields
                            }
                        }
                        limitHit
                        matchCount
                        elapsedMilliseconds
                    }
                }
            }

            fragment FileMatchFields on FileMatch {
                file {
                    url
                }
                repository {
                    stars
                }
                lineMatches {
                    lineNumber
                    offsetAndLengths
                    preview
                }
            }
        `,
        { query },
        token
    )
}

export async function searchQuery(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<vscode.Location[]> {
    const result = await searchQueryResult(query, patternType, token)
    const results: vscode.Location[] = []
    const nodes = result?.data?.search?.results?.results
    for (const node of nodes || []) {
        const url = node?.file?.url
        if (!url) {
            continue
        }
        for (const lineMatch of node.lineMatches || []) {
            const line = lineMatch.lineNumber
            if (!line) {
                continue
            }
            for (const offsetsAndLength of lineMatch.offsetAndLengths || []) {
                const [character, length] = offsetsAndLength
                const start = new vscode.Position(line, character)
                const end = new vscode.Position(line, character + length)
                results.push(
                    new vscode.Location(vscode.Uri.parse(`sourcegraph://${host}${url}`), new vscode.Range(start, end))
                )
            }
        }
    }
    return results
}

export interface SearchParameters {
    query: string
}

export interface SearchResult {
    data?: {
        search?: {
            results?: {
                results?: SearchResultNode[]
            }
        }
    }
}
interface SearchResultNode {
    file?: {
        url?: string
    }
    repository?: {
        stars?: number
    }
    lineMatches?: LineMatch[]
}

interface LineMatch {
    lineNumber?: number
    offsetAndLengths?: [number, number][]
    preview?: string
}
