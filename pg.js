import { postgres } from './deps.ts'
import remodel from './remodel.js'

export async function pgInit(url, migrations) {
  const pg = await crennect(url)

  const dbname = new URL(url).pathname.slice(1)
  await remodel(pg, {
    migrations,
    table: `${dbname}_migrations`,
  })

  self.addEventListener('unload', async () => await pg?.end())

  return pg
}

export async function pgListen(pg, handleEvent) {
  await pg.listen('event', handleEvent)
}

export async function pgStoreNotify(pg, event) {
  const { id, pubkey, created_at: createdAt, kind, tags } = event
  // nip 16 ephemeral
  if (kind >= 20000 && kind < 30000) {
    return await pg.notify('event', JSON.stringify(event))
  }

  // nip 26 delegation
  const delegator = tags.find(([t]) => t === 'delegation')?.at(1)

  await pg.begin((pg) => {
    const line = []

    // nip 1, 3, and 16 replaceable kinds
    if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
      line.push(pg`DELETE FROM event WHERE kind = ${kind}
        AND pubkey = ${pubkey} AND created_at < ${createdAt}`)
    }

    // nip 1 event
    line.push(pg`
      INSERT INTO event (id, pubkey, delegator, created_at, kind, raw)
      VALUES (${id}, ${pubkey}, ${delegator}, ${createdAt}, ${kind},
        ${JSON.stringify(event)})`)

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

      // nip 40 expiration
      if (tag === 'expiration') {
        line.push(pg`UPDATE event SET expires_at = ${Number(values[0])}
          WHERE id = ${id}`)
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
              AND COALESCE(tag.values[1], '') = COALESCE(${values[0]}, ''))`,
        )
      }
    }

    return line
  })
}

export async function pgForEachEvent(pg, filters, cb) {
  for (
    const {
      ids,
      authors,
      kinds,
      since,
      until,
      limit,
      ...tags
    } of filters
  ) {
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
      AND (${authors}::TEXT[] IS NULL
        OR event.pubkey ^@ ANY (${authors}::TEXT[])
        OR event.delegator ^@ ANY (${authors}::TEXT[]))
      AND (${kinds}::INTEGER[] IS NULL OR event.kind = ANY (${kinds}::INTEGER[]))
      AND (${since}::INTEGER IS NULL OR event.created_at >= ${since})
      AND (${until}::INTEGER IS NULL OR event.created_at <= ${until})
      AND (event.expires_at IS NULL
        OR event.expires_at > extract(epoch from now()))
      GROUP BY event.id
      HAVING count(filter_tag.tag) = (SELECT count(*) FROM filter_tag)
      ORDER BY event.created_at DESC
      LIMIT ${limit}`.values().cursor(100)

    for await (const rows of cursor) {
      rows.forEach((row) => cb(row[0]))
    }
  }
}

function connect(url) {
  return postgres(
    url,
    {
      // debug: console.log,
      transform: {
        undefined: null,
      },
    },
  )
}

async function crennect(url) {
  try {
    const pgTry = connect(url)
    await pgTry`SELECT 1` // conn doesn't happen until first query
    return pgTry
  } catch (e) {
    if (e.code === '3D000') { // database does not exist
      try {
        const urlObj = new URL(url)
        const db = urlObj.pathname.slice(1)

        console.log(`db ${db} does not exist, attempting to create ...`)
        urlObj.pathname = '/postgres' // common default
        const tempPg = postgres(urlObj)
        await tempPg.unsafe(`CREATE DATABASE ${db}`)
        await tempPg.end()
        console.log(
          `\x1b[A\x1b[Kdb ${db} does not exist, attempting to create ... created ${db}`,
        )
      } catch {
        throw e
      }

      return connect(url)
    }
    throw e
  }
}
