import { migrate } from 'postgres-migrations'
import pgPkg from 'pg'
import Cursor from 'pg-cursor'
import * as dotenv from 'dotenv'
dotenv.config()
const { Pool } = pgPkg

export const pgConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}

let pg
export async function pgInit () {
  pg = new Pool(pgConfig)
  const client = await pg.connect()
  try {
    await migrate({ client, ensureDatabaseExists: true }, 'migrations')
  } finally {
    client.release()
  }
}

export async function storeNotify (event) {
  const { id, pubkey, created_at: createdAt, kind, tags } = event
  const client = await pg.connect()

  // nip 16 ephemeral
  if (kind >= 20000 && kind < 30000) {
    await client.query('SELECT pg_notify($1, $2)', ['event', event])
    client.release()
    return
  }

  try {
    await client.query('BEGIN')

    // nip 9 reject if deleted
    const { rows } = await client.query(
      `SELECT 1 FROM event JOIN tag
        ON event.id = tag.event_id AND tag.tag = 'e' AND tag.values[1] = $1
      WHERE event.kind = 5 AND event.pubkey = $2 LIMIT 1`,
      [id, pubkey])
    if (rows.length) {
      throw new Error('invalid: note has been deleted')
    }

    // nip 1, 3, and 16 replaceable kinds
    if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
      await client.query(
        `DELETE FROM event
         WHERE kind = $1 AND pubkey = $2 AND created_at < $3`,
        [kind, pubkey, createdAt])
    }

    // nip 1 event
    await client.query(
      `INSERT INTO event (id, pubkey, created_at, kind, raw)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, pubkey, createdAt, kind, event])

    let firstD = true
    for (const [tag, ...values] of tags) {
      // nip 1 tags
      await client.query(
        'INSERT INTO tag (event_id, tag, values) VALUES ($1, $2, $3::TEXT[])',
        [id, tag, values])

      // nip 9 delete referenced event
      if (kind === 5 && tag === 'e' && values.length) {
        await client.query('DELETE FROM event WHERE id = $1 AND pubkey = $2',
          [values[0], pubkey])
      }

      // nip 33 parameterized replacement
      if (kind >= 30000 && kind < 40000 && firstD && tag === 'd') {
        firstD = false
        await client.query(
          `DELETE FROM event
            WHERE kind = $1 AND pubkey = $2 AND created_at < $3
            AND EXISTS (
              SELECT 1
              FROM tag
              WHERE event.id = tag.event_id
              AND tag.tag = 'd'
              AND COALESCE(tag.values[1], '') = COALESCE($4, ''))`,
          [kind, pubkey, createdAt, values[0]])
      }
    }

    await client.query('COMMIT')
  } catch (e) {
    console.error(e)
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

const EVENT_QUERY = `
  WITH filter_tag AS (
    SELECT ltrim(key, '#') AS tag, jsonb_array_to_text_array(value) AS values
    FROM jsonb_each($1)
  )
  SELECT event.raw
  FROM event
  LEFT JOIN tag ON tag.event_id = event.id
  LEFT JOIN filter_tag
    ON tag.tag = filter_tag.tag AND tag.values && filter_tag.values
  WHERE ($2::TEXT[] IS NULL OR event.id ^@ ANY ($2::TEXT[]))
  AND ($3::TEXT[] IS NULL OR event.pubkey ^@ ANY ($3::TEXT[]))
  AND ($4::INTEGER[] IS NULL OR event.kind = ANY ($4::INTEGER[]))
  AND ($5::INTEGER IS NULL OR event.created_at >= $5)
  AND ($6::INTEGER IS NULL OR event.created_at <= $6)
  GROUP BY event.id
  HAVING count(filter_tag.tag) = (SELECT count(*) FROM filter_tag)
  ORDER BY event.created_at DESC
  LIMIT $7
`

export async function forEachEvent (filters, cb) {
  const client = await pg.connect()

  try {
    for (const {
      ids, authors, kinds, since, until, limit, ...tags
    } of filters) {
      const cursor = client.query(
        new Cursor(EVENT_QUERY,
          [tags, ids, authors, kinds, since, until, limit],
          { rowMode: 'array' }))

      const rows = await cursor.read(100)
      rows.forEach(row => cb(row[0]))
    }
  } finally {
    client.release()
  }
}
