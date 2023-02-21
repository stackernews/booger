import sqlite3 from 'sqlite3'
import { open } from 'sqlite'

let db
export async function sqliteInit () {
  db = await open({
    filename: ':memory:',
    driver: sqlite3.Database
  })
  await db.get('PRAGMA foreign_keys = ON')
  await db.exec(`
    CREATE TABLE socket (
      id INTEGER PRIMARY KEY
    );
    CREATE TABLE filters (
      id INTEGER PRIMARY KEY,
      sub_id TEXT NOT NULL,
      socket_id INTEGER NOT NULL,
      since INTEGER,
      until INTEGER,

      CONSTRAINT fk_socket FOREIGN KEY (socket_id)
        REFERENCES socket(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_filters_sub_id ON filters(sub_id);
    CREATE INDEX idx_filters_socket_id ON filters(socket_id);
    CREATE INDEX idx_filters_since ON filters(since);
    CREATE INDEX idx_filters_until ON filters(until);
    CREATE INDEX idx_socket_id_sub_id ON filters(socket_id, sub_id);
    CREATE TABLE events (
        id INTEGER PRIMARY KEY,
        prefix TEXT NOT NULL,
        filter_id INTEGER NOT NULL,

        CONSTRAINT fk_filter FOREIGN KEY (filter_id)
          REFERENCES filters(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_events_filter_id ON events(filter_id);
    CREATE INDEX idx_events_prefix ON events(prefix);
    CREATE TABLE authors (
      id INTEGER PRIMARY KEY,
      prefix TEXT NOT NULL,
      filter_id INTEGER NOT NULL,

      CONSTRAINT fk_filter FOREIGN KEY (filter_id)
        REFERENCES filters(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_authors_filter_id ON authors(filter_id);
    CREATE INDEX idx_authors_prefix ON authors(prefix);
    CREATE TABLE kinds (
      id INTEGER PRIMARY KEY,
      kind INTEGER NOT NULL,
      filter_id INTEGER NOT NULL,

      CONSTRAINT fk_filter FOREIGN KEY (filter_id)
        REFERENCES filters(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_kinds_kind ON kinds(kind);
    CREATE INDEX idx_kinds_filter_id ON kinds(filter_id);
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY,
      tag TEXT NOT NULL,
      value TEXT NOT NULL,
      filter_id INTEGER NOT NULL,

      CONSTRAINT fk_filter FOREIGN KEY (filter_id)
        REFERENCES filters(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_tags_value ON tags(tag, value);
    CREATE INDEX idx_tags_filter_id ON tags(filter_id);`)
  // db.on('trace', console.log)
}

export async function nextSocketId () {
  const { lastID } = await db.run('INSERT INTO socket (id) VALUES (NULL)')
  return lastID
}

export async function closeSub (id, subId) {
  await db.run(
    'DELETE FROM filters WHERE socket_id = ? AND sub_id = ?', [id, subId])
}

export async function closeSocket (id) {
  await db.run('DELETE FROM socket WHERE id = ?', [id])
}

export async function openSub (id, subId, filters) {
  for (const {
    ids = [], authors = [], kinds = [], since, until, limit, ...tags
  } of filters) {
    const { lastID } = await db.run(
      `INSERT INTO filters (sub_id, socket_id, since, until)
        VALUES (?, ?, ?, ?)`,
      [subId, id, since, until])

    const stmtEvnt = await db.prepare(
      'INSERT INTO events (prefix, filter_id) VALUES (?, ?)')
    for (const prefix of ids) {
      await stmtEvnt.run([prefix, lastID])
    }

    const stmtAuth = await db.prepare(
      'INSERT INTO authors (prefix, filter_id) VALUES (?, ?)')
    for (const prefix of authors) {
      await stmtAuth.run([prefix, lastID])
    }

    const stmtKind = await db.prepare(
      'INSERT INTO kinds (kind, filter_id) VALUES (?, ?)')
    for (const kind of kinds) {
      await stmtKind.run([kind, lastID])
    }

    const stmtTag = await db.prepare(
      'INSERT INTO tags (tag, value, filter_id) VALUES (?, ?, ?)')
    for (const [tag, values] of Object.entries(tags)) {
      for (const value of values) {
        await stmtTag.run([tag[1], value, lastID])
      }
    }
  }
}

export async function forEachSub (
  { id, pubkey, created_at: createdAt, kind, tags }, cb) {
  // tags = [[tag0, value00 ... value0N], ...]
  await db.each(
    `WITH event_tags(tag, vals) AS (
      SELECT json_extract(value, '$[0]') AS tag,
        json_remove(value, '$[0]') AS vals
      FROM json_each(?)
    )
    SELECT filters.socket_id, filters.sub_id
    FROM filters
    LEFT JOIN events ON filters.id = events.filter_id
    LEFT JOIN authors ON filters.id = authors.filter_id
    LEFT JOIN kinds ON filters.id = kinds.filter_id
    LEFT JOIN tags ON filters.id = tags.filter_id
    LEFT JOIN event_tags ON tags.tag = event_tags.tag
      AND tags.value IN (SELECT value from json_each(event_tags.vals))
    WHERE (filters.until IS NULL OR ? < filters.until)
    AND  (filters.since IS NULL OR ? < filters.since)
    AND (authors.id IS NULL OR ? LIKE authors.prefix || '%')
    AND (events.id IS NULL OR ? LIKE events.prefix || '%')
    AND (kinds.id IS NULL OR kinds.kind = ?)
    AND (tags.id IS NULL OR event_tags.tag IS NOT NULL)
    GROUP BY filters.socket_id, filters.sub_id
    HAVING count(tags.tag) = 0 OR count(*) = count(tags.tag)`,
    [JSON.stringify(tags), createdAt, createdAt, pubkey, id, kind],
    (e, row) => {
      if (e) console.error(e)
      else cb(row.socket_id, row.sub_id)
    }
  )
}
