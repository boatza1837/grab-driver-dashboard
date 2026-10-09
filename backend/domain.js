export const TZ = 'Asia/Bangkok';
export function satang(value) {
  const match = String(value ?? '').trim().match(/^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error('จำนวนเงินต้องมีทศนิยมไม่เกิน 2 ตำแหน่ง');
  const n = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(n)) throw new Error('จำนวนเงินมากเกินไป');
  return match[1] ? -n : n;
}
export const baht = n => (Number(n) / 100).toFixed(2);
export function thaiDay(iso) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(iso));
}
export function thaiDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) throw new Error('วันเวลาต้องมีเขตเวลา เช่น +07:00');
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('วันเวลาไม่ถูกต้อง');
  return d.toISOString();
}
export function dayRange(day) {
  if (!/^\d{4}-\d\d-\d\d$/.test(day) || Number.isNaN(Date.parse(day+'T00:00:00+07:00'))) throw new Error('วันที่ไม่ถูกต้อง');
  const start = Date.parse(day+'T00:00:00+07:00');
  return [new Date(start).toISOString(), new Date(start+86400000).toISOString()];
}
export function splitMinutes(start, end) {
  const a=Date.parse(start), b=Date.parse(end);
  if (!Number.isFinite(a)||!Number.isFinite(b)||b<=a) throw new Error('เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
  if (b-a>48*3600000) throw new Error('ช่วงขับต้องไม่เกิน 48 ชั่วโมง');
  const result=[];
  for(let t=a;t<b;) {
    const day=thaiDay(new Date(t).toISOString());
    const boundary=Date.parse(day+'T00:00:00+07:00')+86400000;
    const next=Math.min(b,boundary);
    result.push({day,minutes:(next-t)/60000}); t=next;
  }
  return result;
}
export function tripProfit(trip, fuelSatangPerKm=0) {
  const revenue=Number(trip.gross_satang)+Number(trip.tip_satang)-Number(trip.platform_fee_satang);
  const km=Number(trip.paid_km)+Number(trip.deadhead_km);
  const fuel=Math.round(km*fuelSatangPerKm);
  return {revenue_satang:revenue, fuel_estimate_satang:fuel, profit_satang:revenue-fuel-Number(trip.toll_satang), deadhead_ratio:km ? Number(trip.deadhead_km)/km : 0};
}
