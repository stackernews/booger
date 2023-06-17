import { validateDelegation, zErrorToString, zEvent } from './validate.js'
import { z } from 'zod'

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['event'])
    return
  }

  const { msgId, data: { event } } = data
  try {
    await zEvent.parseAsync(event)
    const { kind, created_at: createdAt, pubkey, tags } = event
    const delegation = tags.find(([t]) => t === 'delegation')
    if (delegation) {
      await validateDelegation(kind, createdAt, pubkey, delegation.slice(1))
    }
    self.postMessage({ msgId, accept: true })
  } catch (e) {
    let reason = e.message
    if (e instanceof z.ZodError) {
      reason = zErrorToString(e)
    }
    self.postMessage({ msgId, accept: false, reason })
  }
}
