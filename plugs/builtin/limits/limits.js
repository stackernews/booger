import CONFIG from './limits.config.js'
import remodel from '../../../remodel.js'
import { crennect } from '../../../pg.js'
import migrations from './migrations/index.js'

function hashCode(s) {
  return [...s].reduce(
    (hash, c) => (Math.imul(31, hash) + c.charCodeAt(0)) | 0,
    0,
  )
}

let pg
export async function pgInit() {
  pg = await crennect(Deno.env.get('LIMITS_DB_URL'))
  await remodel(pg, {
    migrations,
    table: 'booger_limits_migrations',
  })
}

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    await pgInit()
    self.postMessage(['event', 'sub', 'unsub', 'connect', 'disconnect'])
    return
  }

  const { action, conn, data: dat } = data
  let res
  try {
    switch (action) {
      case 'connect':
        // insert a new connection, or update the count
        // we use the connection limit as a sentinel for blocking
        res = await pg`INSERT INTO conns (id, ip, headers)
          VALUES (${conn.id}, ${conn.ip}, ${conn.headers})
          ON CONFLICT (id, ip) DO UPDATE
            SET count = LEAST(${CONFIG.maxConnections}, conns.count + 1)
          RETURNING id, ip, count`
        if (res?.at(0)?.count >= CONFIG.maxConnections) {
          throw new Error('blocked: too many connections')
        }
        self.postMessage({ accept: true })
        return
      case 'sub':
        res = await pg`
          SELECT count(*) as sub_count, sum(filter_count) as filter_count
          FROM   subs
          WHERE  conn_id = ${conn.id} OR ip IS NOT DISTINCT FROM ${conn.ip}`
        if (res[0].sub_count >= CONFIG.maxSubscriptions) {
          throw new Error('blocked: too many subscriptions')
        }
        if (res[0].filter_count + dat.filters.length > CONFIG.maxFilters) {
          throw new Error('blocked: too many filters')
        }

        self.postMessage({ accept: true })

        await pg`INSERT INTO subs (ip, conn_id, nostr_sub_id, filter_count) VALUES
          (${conn.ip}, ${conn.id}, ${dat.subId}, ${dat.filters.length})`
        break
      case 'event': {
        // delete content older than interval
        // insert the new event if below the count and not a duplicate
        const code = CONFIG.eventLimits.duplicateContentIgnoreLen &&
            CONFIG.eventLimits.duplicateContentIgnoreLen <
              dat.event.content?.length
          ? hashCode(dat.event.content)
          : null

        res = await pg`
          SELECT count(*) as event_count,
            count(*) FILTER (WHERE content_hash_code = ${code}) as dup_count
          FROM events
          WHERE (conn_id = ${conn.id} OR ip IS NOT DISTINCT FROM ${conn.ip})
          AND created_at > (NOW() AT TIME ZONE 'UTC')
            - MAKE_INTERVAL(secs => ${CONFIG.eventLimits.interval})`
        if (res[0].event_count >= CONFIG.eventLimits.count) {
          throw new Error('blocked: too many events')
        }

        res = await pg.begin((pg) => [
          pg`DELETE FROM events
            WHERE created_at < (NOW() AT TIME ZONE 'UTC')
              - MAKE_INTERVAL(secs => ${CONFIG.eventLimits.interval})`,
          pg`INSERT INTO events (ip, conn_id, content_hash_code, kind)
            VALUES (${conn.ip}, ${conn.id}, ${code}, ${dat.event.kind})
            ON CONFLICT (content_hash_code) DO NOTHING
            RETURNING id`,
        ])
        if (!res?.at(1)?.length) {
          throw new Error('blocked: duplicate content')
        }

        self.postMessage({ accept: true })
        return
      }
      case 'disconnect':
        // decrement the count accounting for the sentinel value
        // if count < 0, delete the connection
        await pg.begin((pg) => [
          pg`UPDATE conns
            SET count = LEAST(${CONFIG.maxConnections - 2}, count - 1)
            WHERE id = ${conn.id} OR ip IS NOT DISTINCT FROM ${conn.ip}`,
          pg`DELETE FROM conns WHERE count < 0`,
        ])
        break
      case 'unsub':
        await pg`DELETE FROM subs WHERE conn_id = ${conn.id} AND nostr_sub_id = ${dat.subId}`
        break
    }
  } catch (e) {
    console.error(e)
    self.postMessage({ accept: false, reason: e.message })
    return
  }

  return
}
