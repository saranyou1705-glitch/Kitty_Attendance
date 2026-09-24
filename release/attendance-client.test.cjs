const {test}=require('node:test');
const assert=require('node:assert/strict');
const {allowedActions,createRecorder}=require('./attendance-client.cjs');
const events=(...types)=>types.map((event_type,i)=>({event_type,event_at:String(i).padStart(2,'0')}));
test('standard and stock refill match server sequences requiring break completion',()=>{
 for(const mode of ['STANDARD','STOCK_REFILL']){
  assert.deepEqual(allowedActions(mode,[]),['IN']);
  assert.deepEqual(allowedActions(mode,events('IN')),['BREAK_OUT']);
  assert.deepEqual(allowedActions(mode,events('IN','BREAK_OUT')),['BREAK_IN']);
  assert.deepEqual(allowedActions(mode,events('IN','BREAK_OUT','BREAK_IN')),['OUT']);
  assert.deepEqual(allowedActions(mode,events('IN','OUT')),[]);
 }
 assert.deepEqual(allowedActions('UNKNOWN',[]),[]);
});
test('BA may end day between branches but cannot leave a branch during break',()=>{
 assert.deepEqual(allowedActions('MULTI_BRANCH',[]),['DAY_IN']);
 assert.deepEqual(allowedActions('MULTI_BRANCH',events('DAY_IN')),['BRANCH_IN','DAY_OUT']);
 assert.deepEqual(allowedActions('MULTI_BRANCH',events('DAY_IN','BRANCH_IN')),['BREAK_OUT','BRANCH_OUT']);
 assert.deepEqual(allowedActions('MULTI_BRANCH',events('DAY_IN','BRANCH_IN','BREAK_OUT')),['BREAK_IN']);
 assert.deepEqual(allowedActions('MULTI_BRANCH',events('DAY_IN','BRANCH_IN','BRANCH_OUT','DAY_OUT')),[]);
});
test('Driver work and break controls remain independent',()=>{
 assert.deepEqual(allowedActions('DRIVER',[]),['IN']);
 assert.deepEqual(allowedActions('DRIVER',events('IN')),['OUT','BREAK_OUT']);
 assert.deepEqual(allowedActions('DRIVER',events('IN','BREAK_OUT')),['OUT','BREAK_IN']);
 assert.deepEqual(allowedActions('DRIVER',events('IN','OUT')),[]);
});
function harness(overrides={}){
 const sent=[];const today={employee:{active:true,attendance_mode:'STANDARD'},events:[]};
 const recorder=createRecorder({loadToday:async()=>today,getPosition:async()=>({coords:{latitude:13,longitude:100,accuracy:5}}),record:async p=>{sent.push(p);return {ok:true}},clock:()=>new Date('2026-09-24T18:00:00Z'),...overrides});
 return {recorder,sent};
}
test('payload retains GPS and Bangkok work date without employee identity overrides',async()=>{
 const {recorder,sent}=harness();await recorder.submit('IN');
 assert.deepEqual(sent,[{eventType:'IN',eventAt:'2026-09-24T18:00:00.000Z',workDate:'2026-09-25',latitude:13,longitude:100,gpsAccuracy:5}]);
});
test('failed location or stale action never writes',async()=>{
 const {recorder,sent}=harness({getPosition:async()=>{throw Error('GPS_DENIED')}});
 await assert.rejects(recorder.submit('IN'),/GPS_DENIED/);assert.equal(sent.length,0);assert.equal(recorder.busy,false);
 await assert.rejects(recorder.submit('OUT'),/ACTION_NOT_AVAILABLE/);assert.equal(sent.length,0);
});
test('uncertain submission cannot automatically retry',async()=>{
 let attempts=0;const {recorder}=harness({record:async()=>{attempts++;throw Error('TIMEOUT')}});
 await assert.rejects(recorder.submit('IN'),/TIMEOUT/);
 await assert.rejects(recorder.submit('IN'),/RECONCILE_REQUIRED/);assert.equal(attempts,1);
 await recorder.reconcile();assert.equal(recorder.uncertain,false);
});
test('double tap never sends concurrent records',async()=>{
 let finish;const {recorder}=harness({loadToday:()=>new Promise(resolve=>{finish=resolve})});
 const first=recorder.submit('IN');await assert.rejects(recorder.submit('IN'),/RECORD_IN_PROGRESS/);
 finish({employee:{active:false}});await assert.rejects(first,/EMPLOYEE_INACTIVE/);assert.equal(recorder.busy,false);
});
