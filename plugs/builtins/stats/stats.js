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

  try {
    const ip = data.client.headers['x-forwarded-for']?.split(',')[0]

    switch (data.action) {
      case 'connect':
        await pg`INSERT INTO conns (ip, headers) VALUES
          (${ip}, ${data.client.headers})`
        break
      case 'disconnect':
        await pg`INSERT INTO disconns (ip) VALUES (${ip})`
        break
      case 'sub':
        await pg.begin((pg) => {
          const lines = []

          lines.push(pg`INSERT INTO subs (ip, nostr_sub_id)
              VALUES (${ip}, ${data.data.subId})`)

          for (
            const {
              ids = [],
              authors = [],
              kinds = [],
              since,
              until,
              limit,
              ...tags
            } of data.data.filters
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
        await pg`INSERT INTO unsubs (ip) VALUES (${ip})`
        break
      case 'eose':
        await pg`INSERT INTO eoses (ip, nostr_sub_id, eose_count, eose_at)
          VALUES (${ip}, ${data.data.subId}, ${data.data.count},
            NOW() AT TIME ZONE 'UTC')`
        break
      case 'notice':
        await pg`INSERT INTO notices (ip, msg)
          VALUES (${ip}, ${data.data.notice})`
        break
      case 'error':
        await pg`INSERT INTO errors (ip, msg)
          VALUES (${ip}, ${data.data.error.message})`
        break
    }
  } catch (e) {
    console.error(e)
  }

  if (['connect', 'sub'].includes(data.action)) {
    self.postMessage({ accept: true })
  }

  return
}
