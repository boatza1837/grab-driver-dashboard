import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function openDb(filename=process.env.DATABASE_PATH || 'database/grab.sqlite') {
  const target=filename===':memory:'?filename:path.isAbsolute(filename)?filename:path.join(root,filename);
  if(target!==':memory:')fs.mkdirSync(path.dirname(target),{recursive:true});
  const db=new DatabaseSync(target); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  for(const name of fs.readdirSync(path.join(root,'database')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort()) {
    if(!db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) {
      db.exec('BEGIN');
      try { db.exec(fs.readFileSync(path.join(root,'database',name),'utf8')); db.prepare('INSERT INTO schema_migrations(name) VALUES(?)').run(name); db.exec('COMMIT'); }
      catch(e){db.exec('ROLLBACK');throw e;}
    }
  }
  return db;
}
export const id=()=>crypto.randomUUID();
export function settings(db,userId) {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings WHERE user_id=?').all(userId).map(x=>[x.key,x.value]));
}
