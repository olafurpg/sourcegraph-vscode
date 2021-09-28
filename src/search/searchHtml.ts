import * as vscode from 'vscode'
import { SearchPatternType } from './scanner'
import { searchQueryResult } from '../queries/searchQuery'

export async function searchHtml(
    host: string,
    query: string,
    patternType: SearchPatternType,
    token: vscode.CancellationToken
): Promise<string> {
    const result = await searchQueryResult(query, patternType, token)
    const html: string[] = []
    const nodes = result?.data?.search?.results?.results
    for (const node of nodes || []) {
        const url = node?.file?.url
        if (!url) {
            continue
        }
        const starCount = node?.repository?.stars
        const stars = starCount ? ` ⭐ ${formatStarCount(starCount)}` : ''
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
            let index = 0
            const highlightedPreview: string[] = []
            if (lineMatchIndex > 0) {
                highlightedPreview.push('\n')
            }
            highlightedPreview.push(`L${line}: `)
            let character = 0
            for (const offsetsAndLength of lineMatch.offsetAndLengths || []) {
                const [start, length] = offsetsAndLength
                if (!character) {
                    // Position the cursor at the first match on the line.
                    character = start
                }
                const end = start + length
                highlightedPreview.push(escapeHtml(preview.slice(index, start)))
                highlightedPreview.push('<mark>')
                highlightedPreview.push(escapeHtml(preview.slice(start, end)))
                highlightedPreview.push('</mark>')
                index = end
            }
            highlightedPreview.push(escapeHtml(preview.slice(index, preview.length)))
            if (first) {
                first = false
                html.push('<p>')
                html.push(`<code>${url}${stars}</code>`)
                html.push('<pre>')
            }
            const uri = `sourcegraph://${host}${url}?L${line + 1}:${character}`
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

function formatStarCount(starCount: number): string {
    if (starCount > 1000) {
        return `${Math.round(starCount / 1000)}k`
    }
    return starCount.toLocaleString()
}

// FIXME: this method is copy pasted from Stackoverflow and should be replaced with a proper implementation
// https://stackoverflow.com/a/6234804
export function escapeHtml(unescapedHtml: string): string {
    return unescapedHtml
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
