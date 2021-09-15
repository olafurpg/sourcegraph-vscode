export interface RepositoryMetadata {
    defaultOid?: string
    defaultAbbreviatedOid?: string
    defaultBranch?: string
    id?: string
    commitToReferenceName?: Map<string, string>
}
