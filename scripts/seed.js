import { openDb,id } from '../backend/db.js';
import { satang } from '../backend/domain.js';
const db=openDb();
const email='demo@local.test';
let user=db.prepare('SELECT id FROM users WHERE email=?').get(email);
if(!user){user={id:id()};db.prepare('INSERT INTO users(id,email,name) VALUES(?,?,?)').run(user.id,email,'คนขับตัวอย่าง')}
const count=db.prepare('SELECT COUNT(*) n FROM trips WHERE user_id=?').get(user.id).n;
if(count){console.log('Demo data already present.');process.exit(0)}
const day=n=>{const d=new Date(Date.now()+n*86400000);return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)};
const at=(d,t)=>new Date(`${d}T${t}+07:00`).toISOString();
db.exec('BEGIN');
try{
  for(let n=-13;n<=0;n++){const date=day(n);db.prepare('INSERT INTO driving_sessions(id,user_id,start_at,end_at,note) VALUES(?,?,?,?,?)').run(id(),user.id,at(date,'06:00'),at(date,'10:30'),'ช่วงเช้า');if(n%3===0){const next=day(n+1);db.prepare('INSERT INTO driving_sessions(id,user_id,start_at,end_at,note) VALUES(?,?,?,?,?)').run(id(),user.id,at(date,'18:00'),at(next,'02:00'),'ช่วงเย็นข้ามคืน')}}
  const places=[['บางนา','อโศก'],['สุขุมวิท','สนามบินสุวรรณภูมิ'],['จตุจักร','สยาม'],['พระราม 9','สีลม']];
  for(let n=-13;n<=0;n++)for(let j=0;j<3;j++){const date=day(n),[pickup,dropoff]=places[(j-n+56)%4],start=at(date,`${String(7+j*2).padStart(2,'0')}:10`),end=at(date,`${String(7+j*2).padStart(2,'0')}:55`),gross=120+j*68+(n+13)*3,fee=Math.round(gross*.2),method=j===1?'cash':'credit',tripId=id();db.prepare('INSERT INTO trips(id,user_id,started_at,ended_at,service,pickup,dropoff,paid_km,deadhead_km,gross_satang,tip_satang,toll_satang,platform_fee_satang,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(tripId,user.id,start,end,'GrabCar',pickup,dropoff,5+j*3,1+j*.7,satang(gross),satang(j===2?20:0),satang(j===1?25:0),satang(fee),method);db.prepare('INSERT INTO wallet_entries(id,user_id,occurred_at,wallet,kind,amount_satang,note,trip_id) VALUES(?,?,?,?,?,?,?,?)').run(id(),user.id,end,method,'trip',satang(gross+(j===2?20:0)-(method==='credit'?fee:0)),'รับจากงานวิ่ง',tripId);if(method==='cash')db.prepare('INSERT INTO wallet_entries(id,user_id,occurred_at,wallet,kind,amount_satang,note,trip_id) VALUES(?,?,?,?,?,?,?,?)').run(id(),user.id,end,'credit','platform_fee',-satang(fee),'ค่าธรรมเนียมงานเงินสด',tripId)}
  for(let n=-12;n<=0;n+=3){const date=day(n);db.prepare('INSERT INTO fuel_logs(id,user_id,filled_at,liters,total_satang,odometer_km,station) VALUES(?,?,?,?,?,?,?)').run(id(),user.id,at(date,'17:30'),31.5,satang('1197.00'),54120+(n+12)*142,'ปตท.');}
  db.prepare('INSERT INTO operating_costs(id,user_id,occurred_at,category,amount_satang,note) VALUES(?,?,?,?,?,?)').run(id(),user.id,at(day(-7),'12:00'),'ล้างรถ',satang('180.00'),'ดูแลรถประจำสัปดาห์');
  db.prepare('INSERT INTO settings(user_id,key,value) VALUES(?,?,?)').run(user.id,'vehicle','Toyota Corolla Altis');
  db.exec('COMMIT');console.log('Demo data ready.');
}catch(e){db.exec('ROLLBACK');throw e}
