import 'std/dotenv/load.ts'
import {
  closeSocket,
  closeSub,
  forEachSub,
  nextSocketId,
  openSub as _openSub,
  sqliteInit,
} from './sqlite.js'
import { zEvent, zFilters } from './validate.js'
import { forEachEvent, listen, pgInit, storeNotify } from './pg.js'

async function store(ws, event) {
  try {
    await zEvent.parseAsync(event)
    await storeNotify(event)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
  } catch (e) {
    ws.send(JSON.stringify(['OK', event.id, false, e.message]))
  }
}

async function openSub(ws, subId, ...filters) {
  await zFilters.parseAsync(filters)
  _openSub(ws.id, subId, filters)
  await forEachEvent(filters, (e) => ws.send(`["EVENT", "${subId}", ${e}]`))
  ws.send(JSON.stringify(['EOSE', subId]))
}

const sockets = new Map() // map[socket id][websocket]
sqliteInit()
await pgInit()
await listen((e) => {
  forEachSub(JSON.parse(e), (id, subId) => {
    const ws = sockets.get(id)
    if (!ws) return
    try {
      ws.send(`["EVENT", "${subId}", ${e}]`)
    } catch (e) {
      console.error(e)
    }
  })
})

Deno.serve(async (req) => {
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
  ws.onopen = () => {
    ws.id = nextSocketId()
    sockets.set(ws.id, ws)
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
          return closeSub(ws.id, m[1])
        default:
          ws.send(JSON.stringify(['NOTICE', `invalid request type ${m[0]}`]))
      }
    } catch (e) {
      console.error(e)
    }
  }
  ws.onerror = console.error
  ws.onclose = () => {
    closeSocket(ws.id)
    sockets.delete(ws.id)
    console.info('client disconnected', ws.id)
  }
  return res
}, { port: Deno.env.get('PORT'), reusePort: true })
