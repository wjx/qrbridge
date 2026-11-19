document.getElementById('cancel').onclick = () => window.capturePicker.choose(null)
window.capturePicker.sources().then((sources) => {
  document.getElementById('status').textContent = sources.length ? '' : 'No screens or windows are available. Close this dialog and try again.'
  for (const source of sources) {
    const button = document.createElement('button')
    const image = document.createElement('img')
    image.src = source.thumbnail
    image.alt = ''
    const label = document.createElement('span')
    label.textContent = source.name
    button.append(image, label)
    button.onclick = () => window.capturePicker.choose(source.id)
    document.getElementById('sources').append(button)
  }
}).catch(() => { document.getElementById('status').textContent = 'Unable to list capture sources. Close this dialog and try again.' })
