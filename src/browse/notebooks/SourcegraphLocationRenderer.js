export const activate = context => ({
  renderOutputItem(data, element) {
    if (!context.postMessage) {
      return
    }
    const json = data.json()
    element.innerHTML += json.html
    document.querySelector(`#${json.id}`).addEventListener('click', () => {
      context.postMessage({
        request: 'openEditor',
        uri: json.uri,
      })
    })
  },
})
