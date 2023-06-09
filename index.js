import 'std/dotenv/load.ts'
import {
  closeSocket,
  closeSub,
  forEachSub,
  forEachSubId,
  nextSocketId,
  openSub as _openSub,
  sqliteInit,
} from './sqlite.js'
import { forEachEvent, listen, pgInit, storeNotify } from './pg.js'
import { plugsAction, plugsInit } from './plugs.js'

async function store(ws, event) {
  try {
    await plugsAction('event', { headers: ws.headers }, { event })
    await storeNotify(event)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
  } catch (e) {
    ws.send(JSON.stringify(['OK', event.id, false, e.message]))
  }
}

async function openSub(ws, subId, ...filters) {
  try {
    await plugsAction('sub', { headers: ws.headers }, { subId, filters })
    _openSub(ws.id, subId, filters)
    let count = 0
    await forEachEvent(
      filters,
      (e) => {
        try {
          ws.send(`["EVENT", "${subId}", ${e}]`)
          count++
        } catch (e) {
          handleError(ws, e)
          throw e
        }
      },
    )
    ws.send(JSON.stringify(['EOSE', subId]))
    plugsAction('eose', { headers: ws.headers }, { subId, count })
      .catch(console.error)
  } catch (e) {
    sendNotice(ws, e.message)
  }
}

const sockets = new Map() // map[socket id][websocket]
sqliteInit()
await pgInit()
await plugsInit()
await listen((e) => {
  forEachSub(JSON.parse(e), (id, subId) => {
    const ws = sockets.get(id)
    if (!ws) return
    try {
      ws.send(`["EVENT", "${subId}", ${e}]`)
    } catch (e) {
      handleError(ws, e)
    }
  })
})

function handleError(ws, error) {
  console.error(error)
  plugsAction('error', { headers: ws.headers }, { error: error.message })
    .catch(console.error)
}

function sendNotice(ws, notice) {
  console.info('notice', notice)
  plugsAction('notice', { headers: ws.headers }, { notice })
    .catch(console.error)
  try {
    ws.send(JSON.stringify(['NOTICE', notice]))
  } catch (e) {
    handleError(ws, e)
  }
}

Deno.serve({
  port: Deno.env.get('PORT'),
  hostname: '127.0.0.1',
  reusePort: true,
}, async (req) => {
  if (req.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': '*',
    }
    // nip 11
    if (req.headers.get('accept') === 'application/nostr+json') {
      try {
        const file = await Deno.readTextFile('./NIP-11.json')
        return new Response(file, { status: 200, headers })
      } catch {
        return new Response(null, { status: 500, headers })
      }
    }
    return new Response(null, { status: 404, headers })
  }

  const { socket: ws, response: res } = Deno.upgradeWebSocket(req)
  ws.onopen = async () => {
    ws.headers = {}
    req.headers.forEach((v, k) => ws.headers[k.toLowerCase()] = v)
    ws.id = nextSocketId()
    sockets.set(ws.id, ws)
    try {
      await plugsAction('connect', { headers: ws.headers })
    } catch (e) {
      sendNotice(ws, e.message)
      ws.close()
    }
  }
  ws.onmessage = async ({ data }) => {
    try {
      const m = JSON.parse(data)
      switch (m[0]) {
        case 'EVENT':
          return await store(ws, m[1])
        case 'REQ':
          return await openSub(ws, ...m.splice(1))
        case 'CLOSE':
          plugsAction('unsub', { headers: ws.headers }, { subId: m[1] })
            .catch(console.error)
          return closeSub(ws.id, m[1])
        default:
          sendNotice(ws, `invalid request type ${m[0]}`)
      }
    } catch (e) {
      handleError(ws, e)
    }
  }
  ws.onerror = (e) => handleError(ws, e)
  ws.onclose = () => {
    plugsAction('disconnect', { headers: ws.headers }).catch(console.error)
    forEachSubId(
      ws.id,
      (subId) => plugsAction('unsub', { headers: ws.headers }, { subId }),
    )
    closeSocket(ws.id)
    sockets.delete(ws.id)
  }
  return res
})
