import * as vscode from 'vscode'
import { graphqlQuery } from '../queries/graphqlQuery'

export interface RepositoryMetadata {
    defaultOid?: string
    defaultAbbreviatedOid?: string
    defaultBranch?: string
    id?: string
    commitToReferenceName?: Map<string, string>
}

export async function repositoryMetadataQuery(
    parameters: RevisionParameters,
    token: vscode.CancellationToken
): Promise<RepositoryMetadata> {
    const response = await graphqlQuery<RevisionParameters, RevisionResult>(RevisionQuery, parameters, token)
    return {
        id: response?.data?.repositoryRedirect?.id,
        defaultOid: response?.data?.repositoryRedirect?.commit?.oid,
        defaultAbbreviatedOid: response?.data?.repositoryRedirect?.commit?.abbreviatedOID,
        defaultBranch: response?.data?.repositoryRedirect?.defaultBranch?.abbrevName,
    }
}

interface RevisionParameters {
    repository: string
}
interface RevisionResult {
    data?: {
        repositoryRedirect?: {
            id?: string
            commit?: {
                oid?: string
                abbreviatedOID?: string
                tree?: {
                    url?: string
                }
            }
            defaultBranch?: {
                abbrevName?: string
            }
        }
    }
}
const RevisionQuery = `
query Revision($repository: String!) {
  repositoryRedirect(name: $repository) {
    ... on Repository {
      id
      mirrorInfo {
        cloneInProgress
        cloneProgress
        cloned
      }
      commit(rev: "") {
        oid
        abbreviatedOID
        tree(path: "") {
          url
        }
      }
      defaultBranch {
        abbrevName
      }
    }
    ... on Redirect {
      url
    }
  }
}`
