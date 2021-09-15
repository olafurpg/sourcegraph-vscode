import { ActivationFunction } from 'vscode-notebook-renderer'
export const activate: ActivationFunction = context => ({
    renderOutputItem(data, element) {
        if (!context.postMessage) {
            return
        }
        element.innerHTML = data.json().html
        document.querySelector(`#a`)?.addEventListener('click', event => {
            // context.postMessage({
            //     request: 'openEditor',
            //     uri: event.id,
            // })
        })
    },
})
