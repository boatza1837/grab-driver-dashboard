import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
process.env.DATABASE_PATH=':memory:';
process.env.DEMO_MODE='true';
const {handler,db}=await import('../backend/server.js');
const uid=crypto.randomUUID();
db.prepare('INSERT INTO users(id,email,name) VALUES(?,?,?)').run(uid,'demo@local.test','Demo');
async function call(url,method='GET',data,cookie=''){
  const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);Object.assign(req,{url,method,headers:{cookie,origin:'http://localhost:3000'}});
  const res={headers:{},status:200,setHeader(k,v){this.headers[k.toLowerCase()]=v},getHeader(k){return this.headers[k.toLowerCase()]},writeHead(status,headers={}){this.status=status;Object.assign(this.headers,headers)},end(value){this.body=value||''}};
  await handler(req,res);return {...res,data:JSON.parse(res.body||'{}')};
}
test('API requires a session, creates trip ledger, and removes it on delete',async()=>{
  assert.equal((await call('/api/trips')).status,401);
  const login=await call('/api/auth/demo','POST');assert.equal(login.status,200);
  assert.match(login.headers['set-cookie'],/Max-Age=1900800/);
  const cookie=login.headers['set-cookie'].split(';')[0];
  const trip=await call('/api/trips','POST',{started_at:'2026-10-09T09:00+07:00',ended_at:'2026-10-09T09:40+07:00',gross_baht:'200.00',platform_fee_baht:'40.00',paid_km:8,deadhead_km:2,payment_method:'cash'},cookie);
  assert.equal(trip.status,201);
  const entries=(await call('/api/wallet','GET',null,cookie)).data;
  assert.equal(entries.length,2);
  assert.deepEqual(entries.map(x=>[x.wallet,x.amount_baht]).sort(),[['cash','200.00'],['credit','-40.00']]);
  const summary=(await call('/api/analytics?from=2026-10-09&to=2026-10-09','GET',null,cookie)).data;
  assert.equal(summary.tripCount,1);
  assert.equal(summary.revenueBaht,'160.00');
  assert.equal((await call('/api/trips/'+trip.data.id,'DELETE',null,cookie)).status,200);
  assert.equal((await call('/api/wallet','GET',null,cookie)).data.length,0);
});

