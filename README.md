# Sourcegraph for Visual Studio Code

[![vs marketplace](https://img.shields.io/vscode-marketplace/v/sourcegraph.sourcegraph.svg?label=vs%20marketplace)](https://marketplace.visualstudio.com/items?itemName=sourcegraph.sourcegraph) [![downloads](https://img.shields.io/vscode-marketplace/d/sourcegraph.sourcegraph.svg)](https://marketplace.visualstudio.com/items?itemName=sourcegraph.sourcegraph) [![build](https://img.shields.io/github/workflow/status/sourcegraph/sourcegraph-vscode/build/master)](https://github.com/sourcegraph/sourcegraph-vscode/actions?query=branch%3Amaster+workflow%3Abuild) [![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![codecov](https://codecov.io/gh/sourcegraph/sourcegraph-vscode/branch/master/graph/badge.svg?token=8TLCsGxBeS)](https://codecov.io/gh/sourcegraph/sourcegraph-vscode)

The Sourcegraph extension for VS Code enables you to open and search code on Sourcegraph.com easily and efficiently.

## Installation

1.  Open the extensions tab on the left side of VS Code (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
2.  Search for `Sourcegraph` -> `Install` and `Reload`.

## Usage

In the command palette (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>), search for `Sourcegraph:` to see available actions.

Keyboard Shortcuts:

| Description                              | Mac                            | Linux / Windows             |
| ---------------------------------------- | ------------------------------ | --------------------------- |
| Sourcegraph: Open file in browser        | <kbd>Option</kbd>+<kbd>A</kbd> | <kbd>Alt</kbd>+<kbd>A</kbd> |
| Sourcegraph: Go to file in editor        | <kbd>Option</kbd>+<kbd>F</kbd> | <kbd>Alt</kbd>+<kbd>F</kbd> |
| Sourcegraph: Go to repository in editor  | <kbd>Option</kbd>+<kbd>R</kbd> | <kbd>Alt</kbd>+<kbd>R</kbd> |
| Sourcegraph: Search selection in browser | <kbd>Option</kbd>+<kbd>S</kbd> | <kbd>Alt</kbd>+<kbd>S</kbd> |

## Extension Settings

This extension contributes the following settings:

- `sourcegraph.url`: The Sourcegraph instance to use. Specify your on-premises Sourcegraph instance here, if applicable.
- `sourcegraph.remoteUrlReplacements`: Object, where each `key` is replaced by `value` in the remote url.
- `sourcegraph.defaultBranch`: String to set the name of the default branch. Always open files in the default branch.
- `sourcegraph.recentlyOpenFiles`: List of strings for recently visited files. This setting is automatically managed by the extension.
- `sourcegraph.recentlyOpenRepositories`: List of strings for recently visited repositories. This setting is automatically managed by the extension.

## Questions & Feedback

Please file an issue: https://github.com/sourcegraph/sourcegraph-vscode/issues/new

## Uninstallation

1.  Open the extensions tab on the left side of VS Code (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>).
2.  Search for `Sourcegraph` -> Gear icon -> `Uninstall` and `Reload`.

## Development

To develop the extension:

- `git clone` the repository somewhere
- Run `npm install` in the directory
- Open the repo with `code .`
- Press <kbd>F5</kbd> to open a new VS Code window with the extension loaded.
- After making changes to `src/extension.ts`, reload the window by clicking the reload icon in the debug toolbar or with <kbd>F5</kbd>.
- To release a new version: follow [Conventional Commit Messages](https://conventionalcommits.org/) and push to/merge into to master. CI will do the release.
