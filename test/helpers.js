import * as secp256k1 from '@noble/secp256k1'
import { createHash, createHmac } from 'crypto'
import WebSocket from 'ws'
import { streams } from './shared.js'

export const serializeEvent = (event) => [
  0,
  event.pubkey,
  event.created_at,
  event.kind,
  event.tags,
  event.content
]

secp256k1.utils.sha256Sync = (...messages) =>
  messages.reduce((hash, message) => hash.update(message), createHash('sha256')).digest()

export async function connect () {
  const host = 'ws://localhost:8006'
  const ws = new WebSocket(host)
  return new Promise((resolve, reject) => {
    ws
      .once('open', () => {
        resolve(ws)
      })
      .once('error', err => {
        console.error(err)
        reject(err)
      })
      .once('close', () => {
        ws.removeAllListeners()
      })
  })
}

let eventCount = 0

export async function createEvent (input, privkey) {
  const event = {
    pubkey: input.pubkey,
    kind: input.kind,
    created_at: input.created_at ?? Math.floor(Date.now() / 1000) + eventCount++,
    content: input.content ?? '',
    tags: input.tags ?? []
  }

  const id = createHash('sha256').update(
    Buffer.from(JSON.stringify(serializeEvent(event)))
  ).digest().toString('hex')

  const sig = Buffer.from(
    secp256k1.schnorr.signSync(id, privkey)
  ).toString('hex')

  event.id = id
  event.sig = sig

  return event
}

export function createIdentity (name) {
  const hmac = createHmac('sha256', process.env.SECRET ?? Math.random().toString())
  hmac.update(name)
  const privkey = hmac.digest().toString('hex')
  const pubkey = Buffer.from(secp256k1.getPublicKey(privkey, true)).toString('hex').substring(2)
  const author = {
    name,
    privkey,
    pubkey
  }
  return author
}

export async function createSubscription (
  ws,
  subscriptionName,
  subscriptionFilters
) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify([
      'REQ',
      subscriptionName,
      ...subscriptionFilters
    ])

    ws.send(data, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

export async function waitForEOSE (ws, subscription) {
  return new Promise((resolve, reject) => {
    const observable = streams.get(ws)

    const sub = observable.subscribe((message) => {
      if (message[0] === 'EOSE' && message[1] === subscription) {
        resolve()
        sub.unsubscribe()
      } else if (message[0] === 'NOTICE') {
        reject(new Error(message[1]))
        sub.unsubscribe()
      }
    })
  })
}

export async function sendEvent (ws, event, successful = true) {
  return new Promise((resolve, reject) => {
    const observable = streams.get(ws)
    const sub = observable.subscribe((message) => {
      if (message[0] === 'OK' && message[1] === event.id) {
        if (message[2] === successful) {
          sub.unsubscribe()
          resolve(message)
        } else {
          sub.unsubscribe()
          reject(new Error(message[3]))
        }
      } else if (message[0] === 'NOTICE') {
        sub.unsubscribe()
        reject(new Error(message[1]))
      }
    })

    ws.send(JSON.stringify(['EVENT', event]), (err) => {
      if (err) {
        sub.unsubscribe()
        reject(err)
      }
    })
  })
}

export async function waitForNextEvent (ws, subscription, content) {
  return new Promise((resolve, reject) => {
    const observable = streams.get(ws)
    observable.subscribe((message) => {
      if (message[0] === 'EVENT' && message[1] === subscription) {
        const event = message[2]
        if (typeof content !== 'string' || event.content === content) {
          resolve(message[2])
        }
      } else if (message[0] === 'NOTICE') {
        reject(new Error(message[1]))
      }
    })
  })
}

export async function waitForEventCount (ws, subscription, count = 1, eose = false) {
  return new Promise((resolve, reject) => {
    const observable = streams.get(ws)
    const events = []

    observable.subscribe((message) => {
      if (message[0] === 'EVENT' && message[1] === subscription) {
        events.push(message[2])
        if (!eose && events.length === count) {
          resolve(events)
        } else if (events.length > count) {
          reject(new Error(`Expected ${count} but got ${events.length} events`))
        }
      } else if (message[0] === 'EOSE' && message[1] === subscription) {
        if (!eose) {
          reject(new Error('Expected event but received EOSE'))
        } else if (events.length !== count) {
          reject(new Error(`Expected ${count} but got ${events.length} events before EOSE`))
        } else {
          resolve(events)
        }
      } else if (message[0] === 'NOTICE') {
        reject(new Error(message[1]))
      }
    })
  })
}

export async function waitForNotice (ws) {
  return new Promise((resolve) => {
    const observable = streams.get(ws)

    observable.subscribe((message) => {
      if (message[0] === 'NOTICE') {
        resolve(message[1])
      }
    })
  })
}

export async function waitForCommand (ws) {
  return new Promise((resolve) => {
    const observable = streams.get(ws)

    observable.subscribe((message) => {
      if (message[0] === 'OK') {
        resolve(message)
      }
    })
  })
}
