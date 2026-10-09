import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
pg.types.setTypeParser(20,value=>Number(value));
let pool;
let migrationPromise;

export const id=()=>crypto.randomUUID();

export function getPool(){
  if(globalThis.__GRAB_TEST_POOL__)return globalThis.__GRAB_TEST_POOL__;
  if(!pool){
    if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL is required');
    pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
  }
  return pool;
}

export async function migrate(db=getPool()){
  if(db===getPool()&&migrationPromise)return migrationPromise;
  const run=async()=>{
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const dir=path.join(root,'database');
    const names=(await fs.readdir(dir)).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
    for(const name of names){
      const exists=await db.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name]);
      if(exists.rowCount)continue;
      const client=await db.connect();
      try{
        await client.query('BEGIN');
        await client.query(await fs.readFile(path.join(dir,name),'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
    }
  };
  if(db===getPool())migrationPromise=run();
  return db===getPool()?migrationPromise:run();
}

export async function one(sql,params=[],db=getPool()){return (await db.query(sql,params)).rows[0]||null}
export async function many(sql,params=[],db=getPool()){return (await db.query(sql,params)).rows}
export async function settings(db,userId){return Object.fromEntries((await many('SELECT key,value FROM settings WHERE user_id=$1',[userId],db)).map(x=>[x.key,x.value]))}
export async function transaction(fn,db=getPool()){
  const client=await db.connect();
  try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}
  catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
}
