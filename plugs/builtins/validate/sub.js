import { zFilters } from '/validate.js'

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['sub'])
    return
  }

  try {
    if (data.action === 'sub') {
      await zFilters.parseAsync(data.data.filters)
    }
  } catch (e) {
    self.postMessage({ accept: false, reason: e.message })
    return
  }

  self.postMessage({ accept: true })
}
