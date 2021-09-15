import * as vscode from 'vscode'
// import { escapeRegExp, startCase } from 'lodash'
// import * as Monaco from 'monaco-editor'
// import { Observable } from 'rxjs'
// import { first } from 'rxjs/operators'
// import { Omit } from 'utility-types'

// import { SymbolKind } from '../../graphql-operations'
// import { IRepository, IFile, ISymbol, ILanguage, IRepoGroup, ISearchContext } from '../../graphql/schema'
// import { isDefined } from '../../util/types'
// import { SearchSuggestion } from '../suggestions'

import { FilterType, isNegatableFilter, resolveFilter, FILTERS } from './filters'
// import { toMonacoSingleLineRange } from './monaco'
import { Filter, Token } from './token'

export const repositoryCompletionItemKind = vscode.CompletionItemKind.Color
const filterCompletionItemKind = vscode.CompletionItemKind.Issue

// type PartialCompletionItem = Omit<vscode.CompletionItem, 'range'>

// /**
//  * COMPLETION_ITEM_SELECTED is a custom Monaco command that we fire after the user selects an autocomplete suggestion.
//  * This allows us to be notified and run custom code when a user selects a suggestion.
//  */
// const COMPLETION_ITEM_SELECTED: vscode.Command = {
//     command: 'completionItemSelected',
//     title: 'completion item selected',
// }

const FILTER_TYPE_COMPLETIONS: Omit<vscode.CompletionItem, 'range'>[] = Object.keys(FILTERS)
    .flatMap(label => {
        const filterType = label as FilterType
        const completionItem: Omit<vscode.CompletionItem, 'range' | 'detail'> = {
            label,
            kind: filterCompletionItemKind,
            insertText: `${label}:`,
            filterText: label,
        }
        if (isNegatableFilter(filterType)) {
            return [
                {
                    ...completionItem,
                    detail: FILTERS[filterType].description(false),
                },
                {
                    ...completionItem,
                    label: `-${label}`,
                    insertText: `-${label}:`,
                    filterText: `-${label}`,
                    detail: FILTERS[filterType].description(true),
                },
            ]
        }
        return [
            {
                ...completionItem,
                detail: FILTERS[filterType].description,
            },
        ]
    })
    // Set a sortText so that filter type suggestions
    // are shown before dynamic suggestions.
    .map((completionItem, index) => ({
        ...completionItem,
        sortText: `0${index}`,
    }))

// /**
//  * Maps Sourcegraph SymbolKinds to Monaco CompletionItemKinds.
//  */
// const symbolKindToCompletionItemKind: Record<vscode.SymbolKind, vscode.CompletionItemKind> = {
//     [vscode.SymbolKind.File]: vscode.CompletionItemKind.File,
//     [vscode.SymbolKind.Module]: vscode.CompletionItemKind.Module,
//     [vscode.SymbolKind.Namespace]: vscode.CompletionItemKind.Module,
//     [vscode.SymbolKind.Package]: vscode.CompletionItemKind.Module,
//     [vscode.SymbolKind.Class]: vscode.CompletionItemKind.Class,
//     [vscode.SymbolKind.Method]: vscode.CompletionItemKind.Method,
//     [vscode.SymbolKind.Property]: vscode.CompletionItemKind.Property,
//     [vscode.SymbolKind.Field]: vscode.CompletionItemKind.Field,
//     [vscode.SymbolKind.Constructor]: vscode.CompletionItemKind.Constructor,
//     [vscode.SymbolKind.Enum]: vscode.CompletionItemKind.Enum,
//     [vscode.SymbolKind.Interface]: vscode.CompletionItemKind.Interface,
//     [vscode.SymbolKind.Function]: vscode.CompletionItemKind.Function,
//     [vscode.SymbolKind.Variable]: vscode.CompletionItemKind.Variable,
//     [vscode.SymbolKind.Constant]: vscode.CompletionItemKind.Constant,
//     [vscode.SymbolKind.String]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.Number]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.Boolean]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.Array]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.Object]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.Key]: vscode.CompletionItemKind.Property,
//     [vscode.SymbolKind.Null]: vscode.CompletionItemKind.Value,
//     [vscode.SymbolKind.EnumMember]: vscode.CompletionItemKind.EnumMember,
//     [vscode.SymbolKind.Struct]: vscode.CompletionItemKind.Struct,
//     [vscode.SymbolKind.Event]: vscode.CompletionItemKind.Event,
//     [vscode.SymbolKind.Operator]: vscode.CompletionItemKind.Operator,
//     [vscode.SymbolKind.TypeParameter]: vscode.CompletionItemKind.TypeParameter,
// }

// const symbolToCompletion = ({ name, kind, location }: ISymbol): PartialCompletionItem => ({
//     label: name,
//     kind: symbolKindToCompletionItemKind[kind],
//     insertText: name + ' ',
//     filterText: name,
//     detail: `${startCase(kind.toLowerCase())} - ${location.resource.repository.name}`,
// })

// const languageToCompletion = ({ name }: ILanguage): PartialCompletionItem | undefined =>
//     name
//         ? {
//               label: name,
//               kind: vscode.CompletionItemKind.TypeParameter,
//               insertText: name + ' ',
//               filterText: name,
//           }
//         : undefined

// const repoGroupToCompletion = ({ name }: IRepoGroup): PartialCompletionItem => ({
//     label: name,
//     kind: repositoryCompletionItemKind,
//     insertText: name + ' ',
//     filterText: name,
// })

// const searchContextToCompletion = ({ spec, description }: ISearchContext): PartialCompletionItem => ({
//     label: spec,
//     kind: repositoryCompletionItemKind,
//     insertText: spec + ' ',
//     filterText: spec,
//     detail: description,
// })

// const suggestionToCompletionItem = (
//     suggestion: SearchSuggestion,
//     options: { isFilterValue: boolean; globbing: boolean }
// ): PartialCompletionItem | undefined => {
//     switch (suggestion.__typename) {
//         case 'File':
//             return fileToCompletion(suggestion, options)
//         case 'Repository':
//             return repositoryToCompletion(suggestion, options)
//         case 'Symbol':
//             return symbolToCompletion(suggestion)
//         case 'Language':
//             return languageToCompletion(suggestion)
//         case 'RepoGroup':
//             return repoGroupToCompletion(suggestion)
//         case 'SearchContext':
//             return searchContextToCompletion(suggestion)
//     }
// }

// /**
//  * An internal Monaco command causing completion providers to be invoked,
//  * and the suggestions widget to be shown.
//  *
//  * Useful to show the suggestions widget right after selecting a filter type
//  * completion, to offer filter values completions.
//  */
// const TRIGGER_SUGGESTIONS: vscode.Command = {
//     command: 'editor.action.triggerSuggest',
//     title: 'Trigger suggestions',
// }

const completeStart = (): vscode.CompletionList => ({
    items: FILTER_TYPE_COMPLETIONS.map(
        (suggestion): vscode.CompletionItem => ({
            ...suggestion,
            // range: new vscode.Range(new vscode.Position(1, 1), new vscode.Position(1, 1)),
            // command: TRIGGER_SUGGESTIONS,
        })
    ),
})

async function completeDefault(token: Token, globbing: boolean): Promise<vscode.CompletionList> {
    // Offer autocompletion of filter values
    const staticSuggestions = FILTER_TYPE_COMPLETIONS.map(
        (suggestion): vscode.CompletionItem => ({
            ...suggestion,
            // range: new vscode.Range(
            //     new vscode.Position(1, token.range.start + 1),
            //     new vscode.Position(1, token.range.end + 1)
            // ),
            // command: TRIGGER_SUGGESTIONS,
        })
    )
    // If the token being typed matches a known filter,
    // only return static filter type suggestions.
    // This avoids blocking on dynamic suggestions to display
    // the suggestions widget.
    if (
        token.type === 'pattern' &&
        staticSuggestions.some(({ label }) => typeof label === 'string' && label.startsWith(token.value.toLowerCase()))
    ) {
        return { items: staticSuggestions }
    }

    return { items: staticSuggestions }
}

// function toMonacoSingleLineRange(range: CharacterRange): vscode.Range {
//     return new vscode.Range(new vscode.Position(1, range.start + 1), new vscode.Position(1, range.end + 1))
// }

async function completeFilter(
    token: Filter,
    column: number,
    globbing: boolean,
    isSourcegraphDotCom?: boolean
): Promise<vscode.CompletionList | null> {
    // const defaultRange = new vscode.Range(new vscode.Position(1, column), new vscode.Position(1, column))
    const { value } = token
    const completingValue = !value || value.range.start + 1 <= column
    if (!completingValue) {
        return null
    }
    const resolvedFilter = resolveFilter(token.field.value)
    if (!resolvedFilter) {
        return null
    }
    let staticSuggestions: vscode.CompletionItem[] = []
    if (resolvedFilter.definition.discreteValues) {
        staticSuggestions = resolvedFilter.definition.discreteValues(token.value, isSourcegraphDotCom).map(
            ({ label, insertText, asSnippet }, index): vscode.CompletionItem => ({
                label,
                sortText: index.toString().padStart(2, '1'), // suggestions sort by order in the list, not alphabetically (up to 99 values).
                kind: vscode.CompletionItemKind.Value,
                insertText: `${insertText || label} `,
                filterText: label,
                // insertTextRules: asSnippet ? vscode.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
                // range: value ? toMonacoSingleLineRange(value.range) : defaultRange,
                // command: COMPLETION_ITEM_SELECTED,
            })
        )
    }
    if (isSourcegraphDotCom === true && (value === undefined || (value.type === 'literal' && value.value === ''))) {
        // On Sourcegraph.com, prompt only static suggestions if there is no value to use for generating dynamic suggestions yet.
        return { items: staticSuggestions }
    }
    return { items: staticSuggestions }
}

/**
 * Returns the completion items for a search query being typed in the Monaco query input,
 * including both static and dynamically fetched suggestions.
 */
export async function getCompletionItems(
    tokens: Token[],
    { character }: Pick<vscode.Position, 'character'>,
    globbing: boolean,
    isSourcegraphDotCom?: boolean
): Promise<vscode.CompletionList | null> {
    character += 1
    if (character === 1) {
        // Show all filter suggestions on the first column.
        return completeStart()
    }
    const tokenAtColumn = tokens.find(({ range }) => range.start + 1 <= character && range.end + 1 >= character)
    if (!tokenAtColumn) {
        throw new Error('getCompletionItems: no token at character')
    }
    const token = tokenAtColumn
    // When the token at column is labeled as a pattern or whitespace, and none of filter,
    // operator, nor quoted value, show static filter type suggestions, followed by dynamic suggestions.
    if (token.type === 'pattern' || token.type === 'whitespace') {
        return completeDefault(token, globbing)
    }
    if (token.type === 'filter') {
        return completeFilter(token, character, globbing, isSourcegraphDotCom)
    }
    return null
}
