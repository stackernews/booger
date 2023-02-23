import shift from 'postgres-shift'
import postgres from 'postgres'
import path from 'path'
import * as dotenv from 'dotenv'
dotenv.config()

let pg
export async function pgInit () {
  pg = postgres(process.env.DB_URL, {
    // debug: console.log,
    transform: {
      undefined: null
    }
  })
  await shift({ sql: pg, path: path.resolve('./migrations') })
}

export async function listen (handleEvent) {
  await pg.listen('event', handleEvent)
}

export async function storeNotify (event) {
  const { id, pubkey, created_at: createdAt, kind, tags } = event
  // nip 16 ephemeral
  if (kind >= 20000 && kind < 30000) {
    return await pg.notify('event', JSON.stringify(event))
  }

  await pg.begin(pg => {
    const line = []

    // nip 1, 3, and 16 replaceable kinds
    if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
      line.push(pg`DELETE FROM event WHERE kind = ${kind}
        AND pubkey = ${pubkey} AND created_at < ${createdAt}`)
    }

    // nip 1 event
    line.push(pg`INSERT INTO event (id, pubkey, created_at, kind, raw) VALUES
      (${id}, ${pubkey}, ${createdAt}, ${kind}, ${JSON.stringify(event)})`)

    let firstD = true
    for (const [tag, ...values] of tags) {
    // nip 1 tags
      line.push(pg`INSERT INTO tag (event_id, tag, values)
        VALUES (${id}, ${tag}, ${values})`)

      // nip 9 delete referenced event
      if (kind === 5 && tag === 'e' && values.length) {
        line.push(pg`DELETE FROM event WHERE id = ${values[0]}
          AND pubkey = ${pubkey}`)
      }

      // nip 33 parameterized replacement
      if (kind >= 30000 && kind < 40000 && firstD && tag === 'd') {
        firstD = false
        line.push(
          pg`DELETE FROM event
             WHERE kind = ${kind}
             AND pubkey = ${pubkey}
             AND created_at < ${createdAt}
             AND EXISTS (
              SELECT 1
              FROM tag
              WHERE event.id = tag.event_id
              AND tag.tag = 'd'
              AND COALESCE(tag.values[1], '') = COALESCE(${values[0]}, ''))`)
      }
    }

    return line
  })
}

export async function forEachEvent (filters, cb) {
  for (const {
    ids, authors, kinds, since, until, limit, ...tags
  } of filters) {
    const cursor = pg`
      WITH filter_tag AS (
        SELECT ltrim(key, '#') AS tag,
          jsonb_array_to_text_array(value) AS values
        FROM jsonb_each(${tags})
      )
      SELECT event.raw
      FROM event
      LEFT JOIN tag ON tag.event_id = event.id
      LEFT JOIN filter_tag
        ON tag.tag = filter_tag.tag AND tag.values && filter_tag.values
      WHERE (${ids}::TEXT[] IS NULL OR event.id ^@ ANY (${ids}::TEXT[]))
      AND (${authors}::TEXT[] IS NULL OR event.pubkey ^@ ANY (${authors}::TEXT[]))
      AND (${kinds}::INTEGER[] IS NULL OR event.kind = ANY (${kinds}::INTEGER[]))
      AND (${since}::INTEGER IS NULL OR event.created_at >= ${since})
      AND (${until}::INTEGER IS NULL OR event.created_at <= ${until})
      GROUP BY event.id
      HAVING count(filter_tag.tag) = (SELECT count(*) FROM filter_tag)
      ORDER BY event.created_at DESC
      LIMIT ${limit}`.values().cursor(100)

    for await (const rows of cursor) {
      rows.forEach(row => cb(row[0]))
    }
  }
}
