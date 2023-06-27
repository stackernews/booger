export default `
  DROP INDEX subs_conn_id_ip_idx;
  ALTER TABLE conns DROP COLUMN ip;
  ALTER TABLE conns RENAME id TO ip;`
