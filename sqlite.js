import { DB } from 'sqlite'

let db
export function sqliteInit() {
  db = new DB(':memory:')
  db.execute('PRAGMA foreign_keys = ON')
  db.execute(`
    CREATE TABLE socket (
      id TEXT PRIMARY KEY
    );
    CREATE TABLE filters (
      id INTEGER PRIMARY KEY,
      sub_id TEXT NOT NULL,
      socket_id TEXT NOT NULL,
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
}

export function addSocket(id) {
  db.query('INSERT INTO socket (id) VALUES (?)', [id])
}

export function closeSub(id, subId) {
  db.query(
    'DELETE FROM filters WHERE socket_id = ? AND sub_id = ?',
    [id, subId],
  )
}

export function delSocket(id) {
  db.query('DELETE FROM socket WHERE id = ?', [id])
}

export function openSub(id, subId, filters) {
  for (
    const {
      ids = [],
      authors = [],
      kinds = [],
      since,
      until,
      limit: _,
      ...tags
    } of filters
  ) {
    const [[lastId]] = db.query(
      `INSERT INTO filters (sub_id, socket_id, since, until)
        VALUES (?, ?, ?, ?) RETURNING id`,
      [subId, id, since, until],
    )

    for (const prefix of ids) {
      db.query('INSERT INTO events (prefix, filter_id) VALUES (?, ?)', [
        prefix,
        lastId,
      ])
    }

    for (const prefix of authors) {
      db.query('INSERT INTO authors (prefix, filter_id) VALUES (?, ?)', [
        prefix,
        lastId,
      ])
    }

    for (const kind of kinds) {
      db.query('INSERT INTO kinds (kind, filter_id) VALUES (?, ?)', [
        kind,
        lastId,
      ])
    }

    for (const [tag, values] of Object.entries(tags)) {
      for (const value of values) {
        db.query(
          'INSERT INTO tags (tag, value, filter_id) VALUES (?, ?, ?)',
          [tag[1], value, lastId],
        )
      }
    }
  }
}

export function forEachSub(
  { id, pubkey, created_at: createdAt, kind, tags },
  cb,
) {
  // tags = [[tag0, value00 ... value0N], ...]
  for (
    const [socket_id, sub_id] of db.query(
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
    )
  ) cb(socket_id, sub_id)
}

export function forEachSubId(socketId, cb) {
  for (
    const [sub_id] of db.query(
      'SELECT sub_id FROM filters WHERE socket_id = ?',
      [socketId],
    )
  ) cb(sub_id)
}
