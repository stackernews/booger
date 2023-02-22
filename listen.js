import createListener from 'pg-listen'
import { pgConfig } from './pg.js'
import { forEachSub } from './sqlite.js'

let listen
export async function listenInit (sockets) {
  listen = createListener(pgConfig)

  listen.notifications.on('event', async e => {
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

  listen.events.on('error', err => {
    console.error('fatal db connection error:', err)
    process.exit(1)
  })

  process.on('exit', () => {
    listen.close()
  })

  await listen.connect()
  await listen.listenTo('event')
}
