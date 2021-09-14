export const activate = context => ({
  renderOutputItem(data, element) {
    if (!context.postMessage) {
      return
    }
    element.innerHTML = data.json().html
    const elements = document.querySelectorAll(`button.sourcegraph-location`)
    for (const element of elements) {
      element.addEventListener('click', event => {
        context.postMessage({
          request: 'openEditor',
          uri: event.target.id,
        })
      })
    }
  },
})
