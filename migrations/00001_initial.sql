CREATE EXTENSION btree_gin;

CREATE TABLE event (
    id TEXT PRIMARY KEY NOT NULL CHECK (id ~* '^[a-f0-9]{64}$'),
    pubkey TEXT NOT NULL CHECK (pubkey ~* '^[a-f0-9]{64}$'),
    delegator TEXT CHECK (delegator IS NULL OR delegator ~* '^[a-f0-9]{64}$'),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER
      CHECK (expires_at IS NULL OR expires_at > extract(epoch from now())),
    kind INTEGER NOT NULL CHECK (kind >= 0),
    raw TEXT NOT NULL
);

CREATE INDEX event_id_spgist_idx ON event USING spgist (id);
CREATE INDEX event_pubkey_spgist_idx ON event USING spgist (pubkey);
CREATE INDEX event_delegator_spgist_idx ON event USING spgist (delegator);
CREATE INDEX event_created_at_idx ON event (created_at DESC);
CREATE INDEX event_expires_at_idx ON event (expires_at);
CREATE INDEX event_kind_idx ON event (kind);

CREATE OR REPLACE FUNCTION jsonb_array_to_text_array(_js jsonb)
  RETURNS text[]
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS
'SELECT ARRAY(SELECT jsonb_array_elements_text(_js))';

CREATE TABLE tag (
    event_id TEXT REFERENCES event(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    values TEXT[] NOT NULL,

    PRIMARY KEY (event_id, tag, values)
);

CREATE INDEX tag_tag_values_idx ON tag USING gin (event_id, tag, values);

CREATE FUNCTION event_notify() RETURNS TRIGGER AS $$
DECLARE
BEGIN
  PERFORM pg_notify('event', NEW.raw);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_notify_trigger
  AFTER INSERT ON event
  FOR EACH ROW
  EXECUTE PROCEDURE event_notify();

-- nip 9
CREATE FUNCTION event_prevent_deleted() RETURNS TRIGGER AS $$
DECLARE
BEGIN
    IF EXISTS (
      SELECT FROM event
      JOIN tag
        ON event.id = tag.event_id AND tag.tag = 'e' AND tag.values[1] = NEW.id
      WHERE event.kind = 5 AND event.pubkey = NEW.pubkey) THEN
      RAISE EXCEPTION 'invalid: note has been deleted';
   END IF;
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_prevent_deleted_trigger
  BEFORE INSERT ON event
  FOR EACH ROW
  EXECUTE PROCEDURE event_prevent_deleted();