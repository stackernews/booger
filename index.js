import CONFIG from './conf.js'
import {
  addSocket as _addSocket,
  closeSub,
  delSocket as _delSocket,
  forEachSub,
  forEachSubId,
  openSub as _openSub,
  sqliteInit,
} from './sqlite.js'
import { forEachEvent, listen, pgInit, storeNotify } from './pg.js'
import { plugsAction, plugsInit } from './plugs.js'

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

Deno.serve({
  port: CONFIG.port,
  hostname: CONFIG.bind,
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
      return Response.json(CONFIG.nip11, { status: 200, headers })
    }
    return new Response(null, { status: 404, headers })
  }

  const id = crypto.randomUUID()
  const headers = Object.fromEntries(req.headers.entries())
  try {
    await plugsAction('connect', { id, headers })
  } catch (e) {
    return new Response(e.message, { status: 403 })
  }

  const { socket: ws, response: res } = Deno.upgradeWebSocket(req)
  ws.booger = { id, headers }
  ws.onopen = () => {
    try {
      addSocket(ws)
    } catch (e) {
      sendNotice(ws, e.message)
      delSocket(ws)
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
          plugsAction('unsub', ws.booger, { subId: m[1] })
            .catch(console.error)
          return closeSub(ws.booger.id, m[1])
        default:
          sendNotice(ws, `invalid request type ${m[0]}`)
      }
    } catch (e) {
      handleError(ws, e)
    }
  }
  ws.onerror = (e) => handleError(ws, e)
  ws.onclose = () => {
    plugsAction('disconnect', ws.booger).catch(console.error)
    forEachSubId(
      ws.booger.id,
      (subId) =>
        plugsAction('unsub', ws.booger, { subId }).catch(console.error),
    )
    delSocket(ws)
  }
  return res
})

async function store(ws, event) {
  try {
    await plugsAction('event', ws.booger, { event })
    await storeNotify(event)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
  } catch (e) {
    ws.send(JSON.stringify(['OK', event.id, false, e.message]))
  }
}

async function openSub(ws, subId, ...filters) {
  try {
    await plugsAction('sub', ws.booger, { subId, filters })
    _openSub(ws.booger.id, subId, filters)
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
    plugsAction('eose', ws.booger, { subId, count })
      .catch(console.error)
  } catch (e) {
    sendNotice(ws, e.message)
  }
}

function addSocket(ws) {
  _addSocket(ws.booger.id)
  sockets.set(ws.booger.id, ws)
}

function delSocket(ws) {
  _delSocket(ws.booger.id)
  sockets.delete(ws.booger.id)
}

function handleError(ws, error) {
  // if socket closed, assume that's the source of the error
  if (ws.readyState !== 1) return

  console.error(error)
  plugsAction('error', ws.booger, {
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack?.split('\n'),
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
    },
  }).catch(console.error)
}

function sendNotice(ws, notice) {
  // if socket closed, assume that's the source of the error
  if (ws.readyState !== 1) return

  console.info('notice', notice)
  plugsAction('notice', ws.booger, { notice })
    .catch(console.error)
  try {
    ws.send(JSON.stringify(['NOTICE', notice]))
  } catch (e) {
    handleError(ws, e)
  }
}
