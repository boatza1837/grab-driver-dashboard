import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { getPool, migrate, one, many, id, settings, transaction } from './db.js';
import { satang, baht, thaiDateTime, dayRange, splitMinutes, thaiDay, tripProfit } from './domain.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const line of (fs.existsSync(path.join(root,'.env'))?fs.readFileSync(path.join(root,'.env'),'utf8'):'').split(/\r?\n/)){
  const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];
}
const origin=process.env.APP_ORIGIN||'http://localhost:3000';
const production=process.env.VERCEL==='1'||!/^https?:\/\/localhost(?::\d+)?$/.test(origin);
const demo=process.env.DEMO_MODE==='true'&&!production;
if(production&&(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32))throw Error('Set SESSION_SECRET to at least 32 characters');
const cookieName='grab_session';
const hash=x=>crypto.createHmac('sha256',process.env.SESSION_SECRET||'local-development-only-secret').update(x).digest('hex');
const linkHash=x=>crypto.createHmac('sha256',process.env.SESSION_SECRET||'local-development-only-secret').update('line-link:'+x).digest('hex');
const err=(status,message)=>Object.assign(new Error(message),{status});
const json=(res,status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data))};
const string=(v,max=250)=>{if(typeof v!=='string'||v.length>max)throw err(400,'ข้อความไม่ถูกต้องหรือยาวเกินไป');return v.trim()};
const num=(v,max=1e8)=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>max)throw err(400,'ตัวเลขไม่ถูกต้อง');return n};
const money=(v,positive=false)=>{let n;try{n=satang(v)}catch(e){throw err(400,e.message)}if(positive&&n<0)throw err(400,'จำนวนเงินต้องไม่ติดลบ');return n};
const when=v=>{try{return thaiDateTime(v)}catch(e){throw err(400,e.message)}};
const rawBody=async(req,limit=6_000_000)=>{if(Buffer.isBuffer(req.body))return req.body;if(typeof req.body==='string')return Buffer.from(req.body);let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>limit)throw err(413,'ไฟล์หรือข้อมูลใหญ่เกินไป');chunks.push(c)}return Buffer.concat(chunks)};
const body=async req=>{if(req.body&&typeof req.body==='object'&&!Buffer.isBuffer(req.body))return req.body;try{return JSON.parse((await rawBody(req)).toString('utf8')||'{}')}catch(e){if(e.status)throw e;throw err(400,'JSON ไม่ถูกต้อง')}};

async function auth(req,db=getPool()){
  const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.split('=')[1];
  if(!raw)return null;
  return one('SELECT u.*,s.expires_at FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()',[hash(raw)],db);
}
async function requireUser(req,db){const u=await auth(req,db);if(!u)throw err(401,'กรุณาเข้าสู่ระบบ');return u}
async function makeSession(res,userId,db=getPool()){
  const token=crypto.randomBytes(32).toString('base64url'),expires=new Date(Date.now()+22*86400000);
  await db.query('INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[hash(token),userId,expires]);
  res.setHeader('Set-Cookie',`${cookieName}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${22*86400}${production?'; Secure':''}`);
}
async function owner(table,userId,key,db=getPool()){
  const allowed=['driving_sessions','trips','fuel_logs','wallet_entries','operating_costs','ocr_drafts'];
  if(!allowed.includes(table))throw err(400,'ตารางไม่ถูกต้อง');
  const row=await one(`SELECT * FROM ${table} WHERE id=$1 AND user_id=$2`,[key,userId],db);if(!row)throw err(404,'ไม่พบรายการ');return row;
}
function serialize(type,row){const x={...row};if(type==='trips'){for(const k of ['gross','tip','toll','platform_fee']){x[k+'_baht']=baht(x[k+'_satang']);delete x[k+'_satang']}}if(type==='fuel_logs'){x.total_baht=baht(x.total_satang);delete x.total_satang}if(type==='wallet_entries'||type==='operating_costs'){x.amount_baht=baht(x.amount_satang);delete x.amount_satang}return x}

const tables={
  sessions:{table:'driving_sessions',date:'start_at',fields:b=>{const start_at=when(b.start_at),end_at=when(b.end_at);splitMinutes(start_at,end_at);return {start_at,end_at,note:string(b.note||'',500)}}},
  trips:{table:'trips',date:'started_at',fields:b=>{const started_at=when(b.started_at),ended_at=when(b.ended_at);if(ended_at<started_at)throw err(400,'เวลาสิ้นสุดก่อนเวลาเริ่ม');const payment_method=string(b.payment_method||'credit',10);if(!['credit','cash'].includes(payment_method))throw err(400,'ช่องทางชำระไม่ถูกต้อง');return {started_at,ended_at,service:string(b.service||'GrabCar',60),pickup:string(b.pickup||'',200),dropoff:string(b.dropoff||'',200),paid_km:num(b.paid_km||0),deadhead_km:num(b.deadhead_km||0),gross_satang:money(b.gross_baht||0,true),tip_satang:money(b.tip_baht||0,true),toll_satang:money(b.toll_baht||0,true),platform_fee_satang:money(b.platform_fee_baht||0,true),payment_method,note:string(b.note||'',500)}}},
  fuel:{table:'fuel_logs',date:'filled_at',fields:b=>({filled_at:when(b.filled_at),liters:num(b.liters),total_satang:money(b.total_baht,true),odometer_km:b.odometer_km===''||b.odometer_km==null?null:num(b.odometer_km),station:string(b.station||'',150),source:'manual',external_id:null,note:string(b.note||'',500)})},
  wallet:{table:'wallet_entries',date:'occurred_at',fields:b=>{const wallet=string(b.wallet,10);if(!['credit','cash'].includes(wallet))throw err(400,'กระเป๋าไม่ถูกต้อง');const amount_satang=money(b.amount_baht);if(!amount_satang)throw err(400,'จำนวนเงินต้องไม่เป็นศูนย์');return {occurred_at:when(b.occurred_at),wallet,kind:string(b.kind||'adjustment',50),amount_satang,note:string(b.note||'',500),trip_id:b.trip_id||null}}},
  costs:{table:'operating_costs',date:'occurred_at',fields:b=>({occurred_at:when(b.occurred_at),category:string(b.category,80),amount_satang:money(b.amount_baht,true),note:string(b.note||'',500)})}
};

async function syncTripWallet(user,trip,db){
  await db.query("DELETE FROM wallet_entries WHERE user_id=$1 AND trip_id=$2 AND kind IN ('trip','platform_fee')",[user.id,trip.id]);
  const wallet=trip.payment_method,received=Number(trip.gross_satang)+Number(trip.tip_satang)-(wallet==='credit'?Number(trip.platform_fee_satang):0);
  if(received)await db.query('INSERT INTO wallet_entries(id,user_id,occurred_at,wallet,kind,amount_satang,note,trip_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),user.id,trip.ended_at,wallet,'trip',received,'รับจากงานวิ่ง',trip.id]);
  if(wallet==='cash'&&Number(trip.platform_fee_satang))await db.query('INSERT INTO wallet_entries(id,user_id,occurred_at,wallet,kind,amount_satang,note,trip_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),user.id,trip.ended_at,'credit','platform_fee',-Number(trip.platform_fee_satang),'ค่าธรรมเนียมงานเงินสด',trip.id]);
}
async function writeRecord(type,user,b,key){
  const t=tables[type];if(!t)throw err(404,'ไม่พบประเภทข้อมูล');const fields=t.fields({...b,userId:user.id});if(type==='fuel'&&!fields.liters)throw err(400,'ลิตรต้องมากกว่าศูนย์');
  return transaction(async db=>{
    if(type==='wallet'&&fields.trip_id)await owner('trips',user.id,fields.trip_id,db);
    const cols=Object.keys(fields),values=Object.values(fields);let record;
    if(key){await owner(t.table,user.id,key,db);const sets=cols.map((c,i)=>`${c}=$${i+1}`).join(',');record=(await db.query(`UPDATE ${t.table} SET ${sets} WHERE id=$${cols.length+1} AND user_id=$${cols.length+2} RETURNING *`,[...values,key,user.id])).rows[0]}
    else{key=id();const placeholders=cols.map((_,i)=>`$${i+3}`).join(',');record=(await db.query(`INSERT INTO ${t.table}(id,user_id,${cols.join(',')}) VALUES($1,$2,${placeholders}) RETURNING *`,[key,user.id,...values])).rows[0]}
    if(type==='trips')await syncTripWallet(user,record,db);return serialize(t.table,record);
  });
}

async function analytics(user,url,db=getPool()){
  const from=url.searchParams.get('from')||thaiDay(new Date(Date.now()-29*86400000).toISOString()),to=url.searchParams.get('to')||thaiDay(new Date().toISOString());
  const [a]=dayRange(from),[,b]=dayRange(to);
  const [trips,fuel,costs,sessions,wallet,prior]=await Promise.all([
    many('SELECT * FROM trips WHERE user_id=$1 AND started_at>=$2 AND started_at<$3 ORDER BY started_at',[user.id,a,b],db),
    many('SELECT * FROM fuel_logs WHERE user_id=$1 AND filled_at>=$2 AND filled_at<$3 ORDER BY filled_at',[user.id,a,b],db),
    many('SELECT * FROM operating_costs WHERE user_id=$1 AND occurred_at>=$2 AND occurred_at<$3',[user.id,a,b],db),
    many('SELECT * FROM driving_sessions WHERE user_id=$1 AND end_at>$2 AND start_at<$3',[user.id,a,b],db),
    many('SELECT wallet,SUM(amount_satang)::bigint balance FROM wallet_entries WHERE user_id=$1 GROUP BY wallet',[user.id],db),
    many('SELECT * FROM fuel_logs WHERE user_id=$1 AND odometer_km IS NOT NULL ORDER BY filled_at',[user.id],db)
  ]);
  let kmPerLiter=null;for(let i=prior.length-1;i>0;i--){const km=prior[i].odometer_km-prior[i-1].odometer_km;if(km>0&&prior[i].liters>0){kmPerLiter=km/prior[i].liters;break}}
  const liters=fuel.reduce((s,x)=>s+x.liters,0),fuelPerKm=kmPerLiter&&liters?Math.round(fuel.reduce((s,x)=>s+Number(x.total_satang),0)/liters/kmPerLiter):0;
  const days={},add=(day,field,n)=>{days[day]??={day,trips:0,revenue_satang:0,profit_satang:0,minutes:0};days[day][field]+=n};
  for(const s of sessions)for(const p of splitMinutes(new Date(s.start_at).toISOString(),new Date(s.end_at).toISOString()))if(p.day>=from&&p.day<=to)add(p.day,'minutes',p.minutes);
  let paid=0,dead=0,revenue=0,profit=0;for(const t of trips){const p=tripProfit(t,fuelPerKm),d=thaiDay(t.started_at);add(d,'trips',1);add(d,'revenue_satang',p.revenue_satang);add(d,'profit_satang',p.profit_satang);paid+=t.paid_km;dead+=t.deadhead_km;revenue+=p.revenue_satang;profit+=p.profit_satang}
  const fuelCost=fuel.reduce((s,x)=>s+Number(x.total_satang),0),operatingCost=costs.reduce((s,x)=>s+Number(x.amount_satang),0);
  return {from,to,tripCount:trips.length,paidKm:paid,deadheadKm:dead,deadheadRatio:(paid+dead)?dead/(paid+dead):0,revenueBaht:baht(revenue),tripProfitEstimateBaht:baht(profit),fuelCostBaht:baht(fuelCost),operatingCostBaht:baht(operatingCost),netCashEstimateBaht:baht(revenue-fuelCost-operatingCost),kmPerLiter,drivingHours:sessions.reduce((sum,s)=>sum+splitMinutes(new Date(s.start_at).toISOString(),new Date(s.end_at).toISOString()).reduce((n,x)=>n+x.minutes,0),0)/60,walletBalances:Object.fromEntries(wallet.map(x=>[x.wallet,baht(x.balance)])),daily:Object.values(days).sort((x,y)=>x.day.localeCompare(y.day)).map(x=>({...x,revenueBaht:baht(x.revenue_satang),profitBaht:baht(x.profit_satang)}))};
}

async function googleCallback(req,res,url,db){
  const code=url.searchParams.get('code'),state=url.searchParams.get('state'),cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('oauth_state='))?.split('=')[1];
  if(!code||!state||!cookie||!crypto.timingSafeEqual(Buffer.from(hash(state)),Buffer.from(hash(cookie))))throw err(400,'OAuth state ไม่ถูกต้อง');
  const redirect=process.env.GOOGLE_REDIRECT_URI||origin+'/api/auth/google/callback';
  const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code'})});if(!tokenRes.ok)throw err(502,'Google token exchange ไม่สำเร็จ');
  const token=await tokenRes.json(),infoRes=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`}});if(!infoRes.ok)throw err(502,'Google profile ไม่สำเร็จ');const info=await infoRes.json();
  if(!info.email_verified||!info.sub||!info.email)throw err(403,'บัญชี Google ยังไม่ยืนยันอีเมล');if(process.env.GOOGLE_ALLOWED_EMAIL&&info.email.toLowerCase()!==process.env.GOOGLE_ALLOWED_EMAIL.toLowerCase())throw err(403,'บัญชีนี้ไม่ได้รับอนุญาต');
  let user=await one('SELECT * FROM users WHERE google_sub=$1',[info.sub],db);if(!user){user=await one('SELECT * FROM users WHERE email=$1',[info.email],db);if(user)await db.query('UPDATE users SET google_sub=$1,name=$2,avatar_url=$3 WHERE id=$4',[info.sub,info.name||info.email,info.picture||null,user.id]);else{user={id:id()};await db.query('INSERT INTO users(id,email,name,avatar_url,google_sub) VALUES($1,$2,$3,$4,$5)',[user.id,info.email,info.name||info.email,info.picture||null,info.sub])}}
  await makeSession(res,user.id,db);res.setHeader('Set-Cookie',[res.getHeader('Set-Cookie'),'oauth_state=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0']);res.writeHead(302,{Location:'/'});res.end();
}

async function ocrUpload(req,user,db){
  const input=await body(req),match=String(input.image||'').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);if(!match)throw err(400,'รองรับภาพ PNG, JPEG, WebP');const bytes=Buffer.from(match[2],'base64');if(bytes.length>4_000_000)throw err(413,'ภาพใหญ่เกิน 4 MB');
  let text='';if(process.env.GOOGLE_VISION_API_KEY){const r=await fetch('https://vision.googleapis.com/v1/images:annotate?key='+encodeURIComponent(process.env.GOOGLE_VISION_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{image:{content:match[2]},features:[{type:'TEXT_DETECTION'}]}]})});if(r.ok){const out=await r.json();text=out.responses?.[0]?.fullTextAnnotation?.text||''}}
  const moneyMatch=text.match(/(?:ยอดรวม|รายได้|ค่าโดยสาร|total|fare)\s*[:฿]?\s*([\d,]+(?:\.\d{1,2})?)/i),parsed={gross_baht:moneyMatch?moneyMatch[1].replaceAll(',',''):'',raw_text:text},draftId=id();
  await db.query('INSERT INTO ocr_drafts(id,user_id,image_data,image_mime,raw_text,parsed_json) VALUES($1,$2,$3,$4,$5,$6)',[draftId,user.id,bytes,'image/'+match[1],text,parsed]);return {id:draftId,status:'pending',...parsed,ocrAvailable:!!process.env.GOOGLE_VISION_API_KEY};
}

async function lineReply(replyToken,text){if(!replyToken||!process.env.LINE_CHANNEL_ACCESS_TOKEN)return;const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:`Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({replyToken,messages:[{type:'text',text:text.slice(0,4900)}]}),signal:AbortSignal.timeout(10000)});if(!r.ok)console.error('LINE reply failed',r.status)}
async function linkLineAccount(lineUserId,code,db){return transaction(async client=>{const existing=await one('SELECT user_id FROM line_accounts WHERE line_user_id=$1',[lineUserId],client);if(existing)return {status:'already_linked',userId:existing.user_id};const link=await one('SELECT user_id FROM line_link_codes WHERE code_hash=$1 AND expires_at>NOW() FOR UPDATE',[linkHash(code)],client);if(!link)return {status:'invalid'};const userLink=await one('SELECT line_user_id FROM line_accounts WHERE user_id=$1',[link.user_id],client);if(userLink)return {status:'user_linked'};await client.query('INSERT INTO line_accounts(line_user_id,user_id) VALUES($1,$2)',[lineUserId,link.user_id]);await client.query('DELETE FROM line_link_codes WHERE user_id=$1',[link.user_id]);return {status:'linked',userId:link.user_id}},db)}
async function issueLineCode(user,db){if(await one('SELECT 1 FROM line_accounts WHERE user_id=$1',[user.id],db))throw err(409,'บัญชีนี้เชื่อม LINE แล้ว');await db.query('DELETE FROM line_link_codes WHERE user_id=$1 OR expires_at<=NOW()',[user.id]);for(let n=0;n<8;n++){const code=String(crypto.randomInt(100000,1000000)),expires=new Date(Date.now()+10*60000);try{await db.query('INSERT INTO line_link_codes(user_id,code_hash,expires_at) VALUES($1,$2,$3)',[user.id,linkHash(code),expires]);return {code,expiresAt:expires.toISOString()}}catch(e){if(e.code!=='23505')throw e}}throw err(503,'สร้างรหัสไม่สำเร็จ กรุณาลองใหม่')}
async function lineWebhook(req,db){
  if(!process.env.LINE_CHANNEL_SECRET)throw err(503,'ยังไม่ได้ตั้งค่า LINE');const raw=await rawBody(req),expected=crypto.createHmac('sha256',process.env.LINE_CHANNEL_SECRET).update(raw).digest('base64'),actual=req.headers['x-line-signature']||'';if(actual.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))throw err(401,'LINE signature ไม่ถูกต้อง');const data=JSON.parse(raw.toString());
  for(const event of data.events||[]){if(!event.webhookEventId)continue;const lineUserId=event.source?.userId||'';const account=await one('SELECT user_id FROM line_accounts WHERE line_user_id=$1',[lineUserId],db),inserted=await db.query('INSERT INTO integration_events(id,source,external_id,user_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id(),'line',event.webhookEventId,account?.user_id||null]);if(!inserted.rowCount||event.type!=='message'||event.message?.type!=='text')continue;const text=event.message.text.slice(0,1000).trim(),code=text.match(/^(?:เชื่อม(?:บัญชี)?\s*)?(\d{6})$/)?.[1];
    if(code){const result=await linkLineAccount(lineUserId,code,db);if(result.userId)await db.query("UPDATE integration_events SET user_id=$1 WHERE source='line' AND external_id=$2",[result.userId,event.webhookEventId]);await lineReply(event.replyToken,result.status==='linked'?'เชื่อมบัญชี Grab Driver สำเร็จแล้ว ✅\n\nรูปที่ส่งให้สแกนได้:\n• ภาพสรุปรายได้หรือยอดงาน Grab\n• ภาพรายละเอียดเที่ยว เช่น ค่าโดยสาร ทิป ค่าธรรมเนียม และระยะทาง\n• ใบเสร็จเติมน้ำมันที่เห็นยอดเงิน ลิตร และเลขไมล์\n\nรองรับ JPEG, PNG และ WebP ไม่เกิน 4 MB ส่งครั้งละ 1 รูป ระบบจะสร้างร่างให้ตรวจในหน้า “อ่านภาพ” ก่อนบันทึกจริง\n\nบันทึกน้ำมันด้วยข้อความได้ เช่น: เติมน้ำมัน 30 1200 54321':result.status==='already_linked'?'LINE นี้เชื่อมกับบัญชีอยู่แล้ว':result.status==='user_linked'?'บัญชีเว็บนี้เชื่อมกับ LINE อื่นอยู่แล้ว':'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จากหน้าเว็บ');continue}
    if(!account){await lineReply(event.replyToken,'ยังไม่ได้เชื่อมบัญชี กรุณาสร้างรหัส 6 หลักจากหน้า ตั้งค่า บนเว็บ แล้วส่งรหัสมาที่นี่');continue}const m=text.match(/^เติมน้ำมัน\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d{1,2})?)(?:\s+(\d+(?:\.\d+)?))?/);if(m){await db.query('INSERT INTO fuel_logs(id,user_id,filled_at,liters,total_satang,odometer_km,source,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(),account.user_id,new Date(event.timestamp),Number(m[1]),money(m[2],true),m[3]?Number(m[3]):null,'line','บันทึกผ่าน LINE']);await lineReply(event.replyToken,'บันทึกน้ำมันแล้ว ✅')}else await lineReply(event.replyToken,'คำสั่งที่ใช้ได้: เติมน้ำมัน 30 1200 54321')
  }
  return {ok:true};
}

async function flowtrackSync(user,db){
  if(!process.env.FLOWTRACK_BASE_URL||!process.env.FLOWTRACK_API_KEY)throw err(503,'ยังไม่ได้ตั้งค่า FlowTrack');const base=new URL(process.env.FLOWTRACK_BASE_URL);if(base.protocol!=='https:')throw err(400,'FlowTrack ต้องใช้ HTTPS');const target=new URL(process.env.FLOWTRACK_FUEL_PATH||'/api/fuel',base);if(target.origin!==base.origin)throw err(400,'FlowTrack URL ไม่ถูกต้อง');const r=await fetch(target,{headers:{Authorization:`Bearer ${process.env.FLOWTRACK_API_KEY}`,'Accept':'application/json'},signal:AbortSignal.timeout(15000)});if(!r.ok)throw err(502,'FlowTrack ตอบกลับไม่สำเร็จ');const data=await r.json();if(!Array.isArray(data))throw err(502,'รูปแบบข้อมูล FlowTrack ไม่ถูกต้อง');let added=0;
  for(const x of data.slice(0,500)){if(!x.id)continue;const result=await db.query('INSERT INTO fuel_logs(id,user_id,filled_at,liters,total_satang,odometer_km,station,source,external_id,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(user_id,source,external_id) DO NOTHING',[id(),user.id,when(x.filled_at),num(x.liters),money(x.total_baht,true),x.odometer_km==null?null:num(x.odometer_km),string(x.station||'',150),'flowtrack',string(String(x.id),120),'']);added+=result.rowCount}
  return {added,total:data.length};
}

const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
export async function handler(req,res){
  const requestOrigin=`${req.headers['x-forwarded-proto']||'http'}://${req.headers.host||'localhost:3000'}`,url=new URL(req.url,requestOrigin),p=url.pathname,method=req.method||'GET';
  try{
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://lh3.googleusercontent.com; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'");
    if(p==='/api/health')return json(res,200,{ok:true,database:!!process.env.DATABASE_URL});
    await migrate();const db=getPool();
    if(p.startsWith('/api/')&&method!=='GET'&&p!=='/api/integrations/line/webhook'){const incoming=req.headers.origin;if(incoming&&incoming!==requestOrigin&&incoming!==origin)throw err(403,'Origin ไม่ถูกต้อง')}
    if(p==='/api/auth/google'&&method==='GET'){if(!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)throw err(503,'ยังไม่ได้ตั้งค่า Google Login');const state=crypto.randomBytes(24).toString('base64url'),redirect=process.env.GOOGLE_REDIRECT_URI||requestOrigin+'/api/auth/google/callback';res.setHeader('Set-Cookie',`oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${production?'; Secure':''}`);const target=new URL('https://accounts.google.com/o/oauth2/v2/auth');target.search=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state,prompt:'select_account'});res.writeHead(302,{Location:target.href});return res.end()}
    if(p==='/api/auth/google/callback'&&method==='GET')return googleCallback(req,res,url,db);
    if(p==='/api/auth/demo'&&method==='POST'){if(!demo)throw err(404,'ไม่พบหน้า');const u=await one("SELECT * FROM users WHERE email='demo@local.test'",[],db);if(!u)throw err(503,'กรุณารัน seed ก่อน');await makeSession(res,u.id,db);return json(res,200,{ok:true})}
    if(p==='/api/auth/logout'&&method==='POST'){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.split('=')[1];if(raw)await db.query('DELETE FROM auth_sessions WHERE token_hash=$1',[hash(raw)]);res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);return json(res,200,{ok:true})}
    if(p==='/api/integrations/line/webhook'&&method==='POST')return json(res,200,await lineWebhook(req,db));
    if(p.startsWith('/api/')){
      const user=await requireUser(req,db);
      if(p==='/api/me')return json(res,200,{id:user.id,name:user.name,email:user.email,avatar:user.avatar_url,demo});
      if(p==='/api/analytics')return json(res,200,await analytics(user,url,db));
      if(p==='/api/calendar'){const month=url.searchParams.get('month')||thaiDay(new Date().toISOString()).slice(0,7);if(!/^\d{4}-\d\d$/.test(month))throw err(400,'เดือนไม่ถูกต้อง');const from=month+'-01',to=new Date(Date.parse(from+'T00:00:00+07:00')+35*86400000).toISOString().slice(0,10);return json(res,200,(await analytics(user,new URL(`/api/analytics?from=${from}&to=${to}`,origin),db)).daily)}
      if(p==='/api/settings'){if(method==='GET')return json(res,200,await settings(db,user.id));if(method==='PUT'){const b=await body(req);for(const key of ['vehicle','fuel_type','monthly_target_baht'])if(key in b)await db.query('INSERT INTO settings(user_id,key,value) VALUES($1,$2,$3) ON CONFLICT(user_id,key) DO UPDATE SET value=EXCLUDED.value',[user.id,key,string(String(b[key]),200)]);return json(res,200,await settings(db,user.id))}}
      if(p==='/api/integrations/status')return json(res,200,{google:!!process.env.GOOGLE_CLIENT_ID,line:!!process.env.LINE_CHANNEL_SECRET,flowtrack:!!process.env.FLOWTRACK_BASE_URL,ocr:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_VISION_API_KEY),aiOcr:!!process.env.GEMINI_API_KEY});
      if(p==='/api/integrations/line/link'){const linked=await one('SELECT linked_at FROM line_accounts WHERE user_id=$1',[user.id],db);if(method==='GET')return json(res,200,{linked:!!linked,linkedAt:linked?.linked_at||null});if(method==='POST')return json(res,201,await issueLineCode(user,db))}
      if(p==='/api/integrations/flowtrack/sync'&&method==='POST')return json(res,200,await flowtrackSync(user,db));
      if(p==='/api/ocr/drafts'&&method==='GET')return json(res,200,(await many('SELECT id,created_at,status,raw_text,parsed_json FROM ocr_drafts WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',[user.id],db)).map(x=>({...x,parsed:x.parsed_json})));
      if(p==='/api/ocr/drafts'&&method==='POST')return json(res,201,await ocrUpload(req,user,db));
      const draft=p.match(/^\/api\/ocr\/drafts\/([^/]+)\/(confirm|discard)$/);if(draft&&method==='POST'){const d=await owner('ocr_drafts',user.id,draft[1],db);if(d.status!=='pending')throw err(409,'ร่างนี้ดำเนินการแล้ว');if(draft[2]==='discard'){await db.query("UPDATE ocr_drafts SET status='discarded',image_data=''::bytea WHERE id=$1",[d.id]);return json(res,200,{ok:true})}const trip=await writeRecord('trips',user,await body(req));await db.query("UPDATE ocr_drafts SET status='confirmed',image_data=''::bytea WHERE id=$1",[d.id]);return json(res,200,trip)}
      const m=p.match(/^\/api\/(sessions|trips|fuel|wallet|costs)(?:\/([^/]+))?$/);if(m){const [,type,key]=m,t=tables[type];if(method==='GET'&&!key){const from=url.searchParams.get('from'),to=url.searchParams.get('to'),params=[user.id];let clause='';if(from&&to){const [a]=dayRange(from),[,b]=dayRange(to);clause=` AND ${t.date}>=$2 AND ${t.date}<$3`;params.push(a,b)}const rows=await many(`SELECT * FROM ${t.table} WHERE user_id=$1${clause} ORDER BY ${t.date} DESC LIMIT 500`,params,db);return json(res,200,rows.map(x=>serialize(t.table,x)))}if(method==='POST'&&!key)return json(res,201,await writeRecord(type,user,await body(req)));if(method==='PUT'&&key)return json(res,200,await writeRecord(type,user,await body(req),key));if(method==='DELETE'&&key){await owner(t.table,user.id,key,db);await transaction(async client=>{if(type==='trips')await client.query('DELETE FROM wallet_entries WHERE user_id=$1 AND trip_id=$2',[user.id,key]);await client.query(`DELETE FROM ${t.table} WHERE id=$1 AND user_id=$2`,[key,user.id])});return json(res,200,{ok:true})}}
      throw err(404,'ไม่พบ API');
    }
    if(method!=='GET')throw err(405,'ไม่รองรับวิธีนี้');const rel=p==='/'?'index.html':p.slice(1);if(!['index.html','app.js','styles.css','favicon.svg'].includes(rel))throw err(404,'ไม่พบหน้า');const file=path.join(root,'frontend',rel);res.writeHead(200,{'Content-Type':(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
  }catch(e){json(res,e.status||500,{error:e.status?e.message:'เกิดข้อผิดพลาดภายในระบบ'});if(!e.status)console.error(e)}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  const port=Number(process.env.PORT||3000);http.createServer(handler).listen(port,()=>console.log(`Grab Driver Dashboard: ${origin}`));
}
