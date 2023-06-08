import { zErrorToString, zFilters, zSub } from '/validate.js'
import { z } from 'zod'

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['sub'])
    return
  }

  try {
    if (data.action === 'sub') {
      await zSub.parseAsync(data.data.subId)
      await zFilters.parseAsync(data.data.filters)
    }
  } catch (e) {
    let reason = e.message
    if (e instanceof z.ZodError) {
      reason = zErrorToString(e)
    }
    self.postMessage({ accept: false, reason })
    return
  }

  self.postMessage({ accept: true })
}
