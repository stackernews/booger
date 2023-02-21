import { WebSocketServer } from 'ws'
import createListener from 'pg-listen'
import {
  closeSocket, closeSub, openSub as _openSub,
  nextSocketId, forEachSub, sqliteInit
} from './sqlite.js'
import { eventSchema, filterSchema, validateSig } from './validate.js'
import { forEachEvent, pgConfig, pgInit, storeNotify } from './pg.js'
import cluster from 'cluster'

async function store (ws, event) {
  try {
    await eventSchema.validateAsync(event)
    await validateSig(event)
    await storeNotify(event)
    ws.send(JSON.stringify(['OK', event.id, true, '']))
  } catch (e) {
    ws.send(JSON.stringify(['OK', event.id, false, e.message]))
  }
}

async function openSub (ws, subId, ...filters) {
  for (const filter of filters) {
    await filterSchema.validateAsync(filter)
  }

  await _openSub(ws.id, subId, filters)
  await forEachEvent(filters, e => ws.send(`["EVENT", "${subId}", ${e}]`))
  ws.send(JSON.stringify(['EOSE', subId]))
}

if (process.env.WORKERS > 1 && cluster.isMaster) {
  console.log(`booger master ${process.pid} is running`)

  for (let i = 0; i < process.env.WORKERS; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.process.pid} died`)
  })
} else {
  const wss = new WebSocketServer({ port: process.env.PORT || 8006 })
  const sockets = new Map(); // map[socket id][websocket]

  (async () => {
    await sqliteInit()
    await pgInit()
  })()

  wss.on('connection', async function connection (ws) {
    ws.id = await nextSocketId()
    sockets.set(ws.id, ws)
    console.log('client connected', ws.id)

    ws.on('message', async data => {
      try {
        const m = JSON.parse(data)
        switch (m[0]) {
          case 'EVENT':
            return await store(ws, m[1])
          case 'REQ':
            return await openSub(ws, ...m.splice(1))
          case 'CLOSE':
            return await closeSub(ws.id, m[1])
          default:
            ws.send(JSON.stringify(['NOTICE', `invalid request type ${m[0]}`]))
        }
      } catch (e) {
        ws.send(JSON.stringify(['NOTICE', e.message]))
        console.error(e)
      }
    })

    ws.on('pong', () => { ws.isAlive = true })
    ws.on('error', console.error)
    ws.on('close', async () => {
      await closeSocket(ws.id)
      sockets.delete(ws.id)
      console.log('client disconnected', ws.id)
    })
  })

  setInterval(() => {
    wss.clients.forEach(ws => {
      if (ws.isAlive === false) return ws.terminate()

      ws.isAlive = false
      ws.ping()
    })
  }, 30000)

  //  listen for any recently received events
  const listener = createListener(pgConfig);
  (async () => {
    listener.notifications.on('event', async e => {
      try {
        await forEachSub(e, (id, subId) => {
          const ws = sockets.get(id)
          if (!ws) return
          ws.send(JSON.stringify(['EVENT', subId, e]))
        })
      } catch (e) {
        console.error(e)
      }
    })

    listener.events.on('error', err => {
      console.error('fatal db connection error:', err)
      process.exit(1)
    })

    process.on('exit', () => {
      listener.close()
    })

    await listener.connect()
    await listener.listenTo('event')
  })()

  console.log(`booger process ${process.pid} started`)
}
