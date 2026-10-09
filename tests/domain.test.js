import test from 'node:test';
import assert from 'node:assert/strict';
import { satang,baht,splitMinutes,tripProfit,dayRange } from '../backend/domain.js';
test('money is exact to satang',()=>{assert.equal(satang('1234.56'),123456);assert.equal(baht(satang('0.10')),'0.10');assert.throws(()=>satang('1.999'))});
test('overnight driving is allocated to each Bangkok date',()=>{assert.deepEqual(splitMinutes('2026-10-08T18:00:00+07:00','2026-10-09T02:00:00+07:00'),[{day:'2026-10-08',minutes:360},{day:'2026-10-09',minutes:120}])});
test('trip profit includes deadhead fuel and fees',()=>{assert.deepEqual(tripProfit({gross_satang:10000,tip_satang:0,platform_fee_satang:2000,toll_satang:500,paid_km:10,deadhead_km:5},200),{revenue_satang:8000,fuel_estimate_satang:3000,profit_satang:4500,deadhead_ratio:1/3})});
test('Bangkok day boundary is seven hours before UTC midnight',()=>{assert.deepEqual(dayRange('2026-10-09'),['2026-10-08T17:00:00.000Z','2026-10-09T17:00:00.000Z'])});
