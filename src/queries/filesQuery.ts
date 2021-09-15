import * as vscode from 'vscode'
import { graphqlQuery } from './graphqlQuery'

export async function filesQuery(parameters: FilesParameters, token: vscode.CancellationToken): Promise<string[]> {
    const result = await graphqlQuery<FilesParameters, FilesResult>(
        FilesQuery,
        parameters,
        new vscode.CancellationTokenSource().token
    )
    return result?.data?.repository?.commit?.fileNames || []
}

const FilesQuery = `
query FileNames($repository: String!, $revision: String!) {
  repository(name: $repository) {
    commit(rev: $revision) {
      fileNames
    }
  }
}
`
interface FilesParameters {
    repository: string
    revision: string
}
interface FilesResult {
    data?: {
        repository?: {
            commit?: {
                fileNames?: string[]
            }
        }
    }
}
