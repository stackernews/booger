import 'std/dotenv/load.ts'
import { toHashString } from 'std/crypto/mod.ts'
import { schnorr } from 'secp'
import { assertArrayIncludes, assertObjectMatch } from 'std/testing/asserts.ts'

let eventCount = 0

export function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + Deno.env.get('PORT'))
    ws.addEventListener('open', () => {
      resolve(ws)
    })
    ws.addEventListener('error', (err) => {
      console.error(err)
      reject(err)
    })
  })
}

export function disconnect(person) {
  return new Promise((resolve, reject) => {
    person.ws.close()
    person.ws.addEventListener('close', () => {
      resolve()
    })
    person.ws.addEventListener('error', (err) => {
      console.error(err)
      reject(err)
    })
  })
}

export async function createPersona() {
  const privkey = toHashString(schnorr.utils.randomPrivateKey())
  const pubkey = toHashString(schnorr.getPublicKey(privkey))
  const author = {
    privkey,
    pubkey,
    ws: await connect(),
  }
  return author
}

export const serializeEvent = (event) => [
  0,
  event.pubkey,
  event.created_at,
  event.kind,
  event.tags,
  event.content,
]

export async function createEvent(input, privkey) {
  const event = {
    pubkey: input.pubkey,
    kind: input.kind,
    created_at: input.created_at ??
      Math.floor(Date.now() / 1000) + eventCount++,
    content: input.content ?? '',
    tags: input.tags ?? [],
  }

  event.id = await sha256HexStr(JSON.stringify(serializeEvent(event)))
  event.sig = signHexStr(event.id, privkey)

  return event
}

export function signHexStr(data, privkey) {
  return toHashString(schnorr.sign(data, privkey))
}

export async function sha256HexStr(str) {
  return toHashString(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str),
    ),
  )
}

export function sendEvent(ws, event) {
  let onMessage
  return new Promise((resolve, reject) => {
    onMessage = ({ data }) => {
      try {
        const message = JSON.parse(data)
        if (message[0] === 'OK' && message[1] === event.id) {
          if (message[2]) {
            resolve(message)
          } else {
            reject(new Error(message[3]))
          }
        } else if (message[0] === 'NOTICE') {
          reject(new Error(message[1]))
        }
      } catch (e) {
        reject(e)
      }
    }

    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify(['EVENT', event]), (err) => {
      if (err) {
        reject(err)
      }
    })
  }).finally(() => ws.removeEventListener('message', onMessage))
}

export function subscribe(ws, name, filters) {
  const data = JSON.stringify([
    'REQ',
    name,
    ...filters,
  ])

  ws.send(data)
}

export async function subscribeWaitForEOSE(ws, filters, subName) {
  const promisedEvents = waitForEvents(ws, 1)
  subscribe(ws, subName || `test-${Math.random()}`, filters)
  assertArrayIncludes(await promisedEvents, ['EOSE'])
}

export function unsubscribe(ws, name) {
  ws.send(JSON.stringify(['CLOSE', name]))
}

export function waitForEvents(ws, num = 1) {
  let to, onMessage
  const events = []
  return new Promise((resolve, reject) => {
    const tof = () => reject(new Error('timedout waiting for event'))
    to = setTimeout(tof, 1000)
    onMessage = ({ data }) => {
      clearTimeout(to)
      const msg = JSON.parse(data)
      if (msg[0] === 'EVENT') {
        events.push(msg[2])
      } else if (msg[0] === 'EOSE') {
        events.push(msg[0])
      } else if (msg[0] === 'NOTICE') {
        reject(new Error(`notice: ${msg[1]}`))
      } else {
        reject(new Error(`unexpected event type ${data}`))
      }
      if (--num === 0) {
        resolve(events)
      } else {
        to = setTimeout(tof, 1000)
      }
    }
    ws.addEventListener('message', onMessage)
  }).finally(() => {
    clearTimeout(to)
    ws.removeEventListener('message', onMessage)
  })
}

export async function subWaitForEvents(ws, filters, num) {
  const promisedEvents = waitForEvents(ws, num)
  subscribe(ws, `test-${Math.random()}`, filters)
  return await promisedEvents
}

export async function assertSendSubReceive(sender, recver, event, filters) {
  const sent = event.sig ? event : await createEvent(
    event,
    sender.privkey,
  )
  await sendEvent(sender.ws, sent)
  const [received] = await subWaitForEvents(recver.ws, filters, 1)

  assertObjectMatch(sent, received)
  return sent
}
