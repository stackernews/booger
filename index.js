import { WebSocketServer } from 'ws'
import {
  closeSocket, closeSub, openSub as _openSub,
  nextSocketId, sqliteInit
} from './sqlite.js'
import { eventSchema, filterSchema, validateSig } from './validate.js'
import { forEachEvent, pgInit, storeNotify } from './pg.js'
import cluster from 'cluster'
import http from 'http'
import fs from 'fs'
import { listenInit } from './listen.js'

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
  // nip 11
  const server = http.createServer((req, res) => {
    if (req.headers.accept === 'application/nostr+json') {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET')
      res.setHeader('Access-Control-Allow-Headers', '*')
      fs.readFile('./NIP-11.json', (err, data) => {
        res.writeHead(err ? 404 : 200, { 'Content-Type': 'application/json' })
        res.end(data)
      })
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', function (request, socket, head) {
    wss.handleUpgrade(request, socket, head, function (ws) {
      wss.emit('connection', ws, request)
    })
  })
  server.listen(process.env.port || 8006)

  const sockets = new Map(); // map[socket id][websocket]
  (async () => {
    await sqliteInit()
    await pgInit()
    await listenInit(sockets)
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

  console.log(`booger process ${process.pid} started`)
}
