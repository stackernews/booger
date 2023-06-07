import { validateDelegation, zEvent } from '/validate.js'

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    self.postMessage(['event'])
    return
  }

  try {
    if (data.action === 'event') {
      await zEvent.parseAsync(data.data.event)
      const { kind, created_at: createdAt, pubkey, tags } = data.data.event
      const delegation = tags.find(([t]) => t === 'delegation')
      if (delegation) {
        await validateDelegation(kind, createdAt, pubkey, delegation.slice(1))
      }
    }
  } catch (e) {
    self.postMessage({ accept: false, reason: e.message })
    return
  }

  self.postMessage({ accept: true })
}
