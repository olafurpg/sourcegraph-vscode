import * as vscode from 'vscode'
import { spawn } from 'child_process'
import { CancellationToken } from 'vscode'
import { log } from '../log'
import { SearchPatternType } from './highlighting/scanner'
// import { log } from '../log'

export function graphqlQuery<A, B>(query: string, variables: A, token: CancellationToken): Promise<B | undefined> {
    return new Promise<B | undefined>((resolve, reject) => {
        const stdoutBuffer: string[] = []
        const onExit = (exit: number) => {
            if (exit === 0) {
                const json = stdoutBuffer.join('')
                try {
                    const parsed: B = JSON.parse(json)
                    resolve(parsed) // wrap in promise because this method will be async in the future
                } catch (error) {
                    reject(error)
                }
            } else {
                reject({ exit })
            }
        }
        const onData = (chunk: string) => {
            stdoutBuffer.push(chunk)
        }
        const command: string[] = ['api', '-query', query.replace(/\n/g, ' '), '-vars', JSON.stringify(variables)]
        log.appendLine('src ' + command.map(part => `'${part}'`).join(' '))
        const proc = spawn('src', command)
        proc.stdout.on('data', onData)
        proc.on('close', onExit)
        proc.on('disconnect', onExit)
        proc.on('error', onExit)
        proc.on('exit', onExit)
        token.onCancellationRequested(() => {
            if (!proc.killed) {
                proc.kill()
                reject()
            }
        })
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    })
}

const RepositoryQuery = `
query RepositoriesForPopover($query: String, $first: Int) {
  repositories(first: $first, query: $query) {
    nodes {
      name
      isFork
    }
    totalCount
    pageInfo {
      hasNextPage
    }
  }
}
`
export async function repositories(query: string, token: vscode.CancellationToken): Promise<string[]> {
    const result = await graphqlQuery<RepositoryParameters, RepositoryResult>(
        RepositoryQuery,
        {
            query,
            first: 10000,
        },
        token
    )
    return result?.data?.repositories?.nodes?.filter(node => !node.isFork).map(node => node.name) || []
}

interface RepositoryParameters {
    query: string
    first: number
}

interface RepositoryResult {
    data?: {
        repositories?: {
            nodes?: RepositoryNode[]
        }
    }
    first: number
}
interface RepositoryNode {
    name: string
    isFork: boolean
}
function searchQuery(patternType: SearchPatternType): string {
    return `
query Search($query: String!) {
    search(query: $query, patternType:${SearchPatternType[patternType]}) {

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
    lineMatches {
      lineNumber
      offsetAndLengths
      preview
    }
  }
`
}
export async function searchHtml(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<string> {
    const result = await graphqlQuery<SearchParameters, SearchResult>(searchQuery(patternType), { query }, token)
    const html: string[] = []
    const nodes = result?.data?.search?.results?.results
    for (const node of (nodes || []).slice(0, 4)) {
        const url = node?.file?.url
        if (!url) {
            continue
        }
        html.push('<p>')
        html.push(`<code>${url}</code>`)
        html.push('<pre>')
        for (const [lineMatchIndex, lineMatch] of (node.lineMatches || []).entries()) {
            const line = lineMatch.lineNumber
            if (!line) {
                continue
            }
            const preview = lineMatch.preview
            if (!preview) {
                continue
            }
            if (lineMatchIndex > 0) {
                html.push('\n')
            }
            const uri = `sourcegraph://${host}${url}?L${line + 1}:0`
            let index = 0
            const highlightedPreview: string[] = []
            highlightedPreview.push(`L${line}: `)
            for (const offsetsAndLength of lineMatch.offsetAndLengths || []) {
                const [start, length] = offsetsAndLength
                const end = start + length - 1
                highlightedPreview.push(escapeHtml(preview.slice(index, start)))
                highlightedPreview.push(`<mark>`)
                highlightedPreview.push(escapeHtml(preview.slice(start, end)))
                highlightedPreview.push(`</mark>`)
                index = end
            }
            highlightedPreview.push(escapeHtml(preview.slice(index, preview.length)))
            html.push(
                `<a id='${uri}' style='cursor:pointer' class='sourcegraph-location'>${highlightedPreview.join('')}</a>`
            )
        }
        html.push('</pre>')
        html.push('</p>')
    }
    return html.join('')
}

export async function search(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<vscode.Location[]> {
    const result = await graphqlQuery<SearchParameters, SearchResult>(searchQuery(patternType), { query }, token)
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

interface SearchParameters {
    query: string
}
interface SearchResult {
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
    lineMatches?: LineMatch[]
}
interface LineMatch {
    lineNumber?: number
    offsetAndLengths?: [number, number][]
    preview?: string
}

// FIXME: this method is copy pasted from Stackoverflow and should be replaced with a proper implementation
// https://stackoverflow.com/a/6234804
function escapeHtml(unescapedHtml: string): string {
    return unescapedHtml
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
