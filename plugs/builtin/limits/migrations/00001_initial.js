export default `
CREATE TABLE conns (
  id TEXT PRIMARY KEY,
  ip TEXT UNIQUE,
  headers JSONB,
  count INTEGER DEFAULT 0
);

CREATE UNIQUE INDEX conns_id_ip_idx ON conns (id, ip);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT,
  conn_id TEXT,
  content_hash_code INTEGER UNIQUE,
  kind INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE TABLE subs (
  id BIGSERIAL PRIMARY KEY,
  ip TEXT,
  conn_id TEXT,
  nostr_sub_id TEXT,
  filter_count INTEGER,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC')
);

CREATE UNIQUE INDEX subs_conn_id_ip_idx ON subs (conn_id, ip);
CREATE UNIQUE INDEX subs_conn_id_nostr_sub_id_idx ON subs (conn_id, nostr_sub_id);`
