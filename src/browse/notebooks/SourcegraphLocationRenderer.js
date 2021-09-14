export const activate = context => ({
  renderOutputItem(data, element) {
    if (!context.postMessage) {
      return
    }
    element.innerHTML = data.json().html
    const elements = document.querySelectorAll(`.sourcegraph-location`)
    for (const element of elements) {
      element.addEventListener('click', () => {
        context.postMessage({
          request: 'openEditor',
          uri: element.id,
        })
      })
    }
  },
})
