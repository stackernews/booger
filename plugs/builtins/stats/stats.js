import postgres from 'postgres'
import shift from 'postgres-shift'

let pg
export async function pgInit() {
  pg = postgres(
    Deno.env.get('STATS_DB_URL'),
    {
      // debug: console.log,
      transform: {
        undefined: null,
      },
    },
  )
  await shift({
    sql: pg,
    path: new URL('./migrations', import.meta.url).pathname,
  })
}

self.onmessage = async ({ data }) => {
  if (data === 'getactions') {
    await pgInit()

    self.postMessage([
      'connect',
      'disconnect',
      'sub',
      'unsub',
      'eose',
      'notice',
      'error',
    ])
    return
  }

  const { action, conn, data: dat } = data
  try {
    switch (action) {
      case 'connect':
        await pg`INSERT INTO conns (id, headers) VALUES
          (${conn.id}, ${conn.headers})`
        break
      case 'disconnect':
        await pg`UPDATE conns SET closed_at = NOW() AT TIME ZONE 'UTC' WHERE id = ${conn.id}`
        break
      case 'sub':
        await pg.begin((pg) => {
          const lines = []

          lines.push(pg`INSERT INTO subs (conn_id, nostr_sub_id)
              VALUES (${conn.id}, ${dat.subId})`)

          for (
            const {
              ids = [],
              authors = [],
              kinds = [],
              since,
              until,
              limit,
              ...tags
            } of dat.filters
          ) {
            lines.push(pg`INSERT INTO filters (sub_id, since, until, lmt)
              VALUES (currval('subs_id_seq'), ${since}, ${until}, ${limit})`)
            for (const id of ids) {
              lines.push(pg.query`INSERT INTO ids (filter_id, event_id)
                VALUES (currval('filters_id_seq'), ${id})`)
            }
            for (const author of authors) {
              lines.push(pg`INSERT INTO authors (filter_id, author)
                VALUES (currval('filters_id_seq'), ${author})`)
            }
            for (const kind of kinds) {
              lines.push(pg`INSERT INTO kinds (filter_id, kind)
                VALUES (currval('filters_id_seq'), ${kind})`)
            }
            for (const [tag, values] of Object.entries(tags)) {
              lines.push(pg`INSERT INTO tags (filter_id, tag)
                VALUES (currval('filters_id_seq'), ${tag})`)
              for (const value of values) {
                lines.push(pg`INSERT INTO vals (tag_id, val)
                  VALUES (currval('tags_id_seq'), ${value})`)
              }
            }
          }

          return lines
        })
        break
      case 'unsub':
        await pg`UPDATE subs SET closed_at = NOW() AT TIME ZONE 'UTC'
          WHERE conn_id = ${conn.id} AND nostr_sub_id = ${dat.subId}`
        break
      case 'eose':
        await pg`UPDATE subs SET eose_at = NOW() AT TIME ZONE 'UTC', eose_count = ${dat.count}
          WHERE conn_id = ${conn.id} AND nostr_sub_id = ${dat.subId}`
        break
      case 'notice':
        await pg`INSERT INTO notices (conn_id, msg)
          VALUES (${conn.id}, ${dat.notice})`
        break
      case 'error':
        await pg`INSERT INTO errors (conn_id, error)
          VALUES (${conn.id}, ${dat.error})`
        break
    }
  } catch (e) {
    console.error(e)
  }

  if (['connect', 'sub'].includes(action)) {
    self.postMessage({ accept: true })
  }

  return
}
