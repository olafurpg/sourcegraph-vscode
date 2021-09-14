import { ActivationFunction } from 'vscode-notebook-renderer'
export const activate: ActivationFunction = context => ({
    renderOutputItem(data, element) {
        if (!context.postMessage) {
            return
        }
        element.innerHTML += data.json().html
    },
})
