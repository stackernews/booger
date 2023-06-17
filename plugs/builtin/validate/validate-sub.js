import { zErrorToString, zFilters, zSub } from './validate.js'
import { z } from 'zod'

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['sub'])
    return
  }

  const { msgId, data: { subId, filters } } = data
  try {
    await zSub.parseAsync(subId)
    await zFilters.parseAsync(filters)
    self.postMessage({ msgId, accept: true })
  } catch (e) {
    let reason = e.message
    if (e instanceof z.ZodError) {
      reason = zErrorToString(e)
    }
    self.postMessage({ msgId, accept: false, reason })
  }
}
