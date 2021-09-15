import * as vscode from 'vscode'
import { SearchPatternType } from '../highlighting/scanner'
import { graphqlQuery, SearchParameters, SearchResult, searchQuery, escapeHtml } from '../queries/graphqlQuery'

export async function searchHtml(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<string> {
    const result = await graphqlQuery<SearchParameters, SearchResult>(searchQuery(patternType), { query }, token)
    const html: string[] = []
    const nodes = result?.data?.search?.results?.results
    for (const node of nodes || []) {
        const url = node?.file?.url
        if (!url) {
            continue
        }
        const lineMatches = node.lineMatches || []
        if (lineMatches.length === 0) {
            continue
        }
        let first = true
        let filenameMatchesCount = 0
        for (const [lineMatchIndex, lineMatch] of lineMatches.entries()) {
            const line = lineMatch.lineNumber
            if (!line) {
                continue
            }
            const preview = lineMatch.preview
            if (!preview) {
                continue
            }
            const uri = `sourcegraph://${host}${url}?L${line + 1}:0`
            let index = 0
            const highlightedPreview: string[] = []
            if (lineMatchIndex > 0) {
                highlightedPreview.push('\n')
            }
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
            if (first) {
                first = false
                html.push('<p>')
                html.push(`<code>${url}</code>`)
                html.push('<pre>')
            }
            html.push(
                `<a id='${uri}' style='cursor:pointer' class='sourcegraph-location'>${highlightedPreview.join('')}</a>`
            )
            filenameMatchesCount++
            if (filenameMatchesCount > 5) {
                break
            }
        }
        html.push('</pre>')
        html.push('</p>')
    }
    return html.join('')
}
