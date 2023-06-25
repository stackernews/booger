export default `
  DROP INDEX subs_conn_id_ip_idx;
  CREATE INDEX subs_conn_id_ip_idx ON subs (conn_id, ip);`
