const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8').replace('navigation();init();','');
function setup(fetcher){
 const nodes=new Map(),listeners={},storage=new Map();
 const node=key=>{if(!nodes.has(key))nodes.set(key,{innerHTML:'',textContent:'',hidden:false,value:'',classList:{add(){},remove(){},toggle(){}},showModal(){}});return nodes.get(key)};
 const context=vm.createContext({console,Intl,Date,Number,String,Set,Map,JSON,Promise,AbortController,FormData,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,setInterval(){},window:{liff:{getAccessToken:()=> 'test-token'}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener:(key,fn)=>listeners[key]=fn},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},fetch:fetcher||(async()=>{throw Error('Failed to fetch')})});
 vm.runInContext(source,context);return {run:code=>vm.runInContext(code,context),node,listeners};
}
test('Bangkok clock converts timestamps and no fixed demo clock remains',()=>{
 const {run}=setup();assert.equal(run("dateKey(new Date('2026-09-17T18:01:00Z'))"),'2026-09-18');assert.equal(run("time('2026-09-17T18:01:00Z')"),'01:01');assert(!source.includes('13:55'));assert(!source.includes('Don Thanakorn'));
});
test('calendar loads only authenticated employee endpoints for selected month and day',async()=>{
 const calls=[];const {run}=setup(async(url,options)=>{calls.push([new URL(url).searchParams.get('action'),JSON.parse(options.body)]);return {ok:true,json:async()=>({ok:true,rows:[],events:[],daily:null})}});
 run("state.boot={employee:{id:'self',name:'Actual Person'}};state.month='2026-08';state.selected='2026-08-12'");
 const html=await run('calendarView()');assert(html.includes('Actual Person'));assert.deepEqual(calls,[['employee_month',{month:'2026-08'}],['today',{date:'2026-08-12'}]]);assert(!html.includes('09:02'));
});
test('failed load displays error, never fabricated attendance',async()=>{
 const {run,node}=setup();run("state.connected=true;state.boot={employee:{id:'self'}};state.page='clock'");await run('render()');assert(node('#content').innerHTML.includes('โหลดข้อมูลไม่สำเร็จ'));assert(!node('#content').innerHTML.includes('พิกัดพร้อม'));
});
test('half-day drafts require 240 net minutes and are isolated per employee',()=>{
 const {run}=setup();run("state.boot={employee:{id:'first'}}");assert(run('leaveView()').includes('HALF_DAY_AM'));assert(run('leaveView()').includes('HALF_DAY_PM'));run("sessionStorage.setItem(draftKey(),JSON.stringify([{kind:'leave',date:'2026-09-18',label:'PRIVATE DRAFT'}]))");assert(run("draftHistory('leave')").includes('PRIVATE DRAFT'));run("state.boot={employee:{id:'second'}}");assert(!run("draftHistory('leave')").includes('PRIVATE DRAFT'));assert(source.includes("requiredNetMinutes:leave&&data.duration!=='FULL_DAY'?240:0"));
});
test('employee cannot navigate into admin pages through fabricated button',()=>{
 const {run,listeners}=setup();listeners.click({target:{closest:()=>({dataset:{page:'audit'}})}});assert.equal(run('state.page'),'clock');
});
test('work hours display actual paid_work_hours, not the net report balance',()=>{
 const {run}=setup();const html=run("dailyTable([{employee:{name:'Example'},work_date:'2026-09-01',paid_work_hours:9.81,net_hours:1.81}])");assert(html.includes('9 ชม. 49 นาที'));assert(!html.includes('1 ชม. 49 นาที'));
});
test('duration formatting handles minutes, negative balances and rounding rollover',()=>{const {run}=setup();assert.equal(run('hours(1.5)'),'1 ชม. 30 นาที');assert.equal(run('hours(-0.5)'),'-0 ชม. 30 นาที');assert.equal(run('hours(1.999)'),'2 ชม. 0 นาที');assert.equal(run('hours(null)'),'—');assert.equal(run('hours(0)'),'0 ชม. 0 นาที')});
test('clock retains all four attendance buttons',async()=>{const {run}=setup(async()=>({ok:true,json:async()=>({ok:true,events:[]})}));run("state.boot={employee:{id:'self'}}");const html=await run('clockView()');for(const label of ['เข้างาน','ออกพัก','กลับจากพัก','ออกงาน'])assert(html.includes(label))});
test('actual HR cannot switch into Admin workspace',()=>{const {run,listeners}=setup();run("state.role='hr';state.boot={isAdmin:true,adminRole:'HR'}");listeners.click({target:{closest:()=>({dataset:{workspace:'admin'}})}});assert.equal(run('state.role'),'hr')});
test('Admin can inspect HR with server scoped requests',async()=>{const bodies=[];const {run,listeners}=setup(async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});run("state.boot={isAdmin:true,adminRole:'ADMIN'};state.connected=true;state.role='admin'");listeners.click({target:{closest:()=>({dataset:{workspace:'hr'}})}});assert.equal(run('state.role'),'hr');assert.equal(bodies[0].previewRole,'HR');assert(!run('activeMenu().some(x=>x[0]===\"audit\")'))});
test('entering schedule aligns calendar month and selected work date',()=>{
 const {run,listeners}=setup();run("state.role='admin';state.date='2026-09-21';state.month='2026-08';state.selected='2026-08-01'");listeners.click({target:{closest:()=>({dataset:{page:'schedule'}})}});assert.equal(run('state.month'),'2026-09');assert.equal(run('state.selected'),'2026-09-21');
});
test('older request cannot replace a newer page',async()=>{
 let release;const {run,node}=setup(async()=>{await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});
 run("state.connected=true;state.role='admin';state.page='dashboard'");const first=run('render()');run("state.page='settings'");await run('render()');release();await first;assert(node('#content').innerHTML.includes('ตั้งค่าระบบ'));assert(!node('#content').innerHTML.includes('เข้างานแล้ว'));
});
test('daily report loads selected date and HR scope with break columns and print action',async()=>{const calls=[];const {run}=setup(async(url,options)=>{calls.push({action:new URL(url).searchParams.get('action'),body:JSON.parse(options.body)});return {ok:true,json:async()=>({ok:true,rows:[{employee:{name:'Actual employee'},paid_work_hours:8.5,break_out_at:'2026-09-20T05:00:00Z'}]})}});run("state.role='hr';state.date='2026-09-20'");const html=await run('reportView()');assert.equal(calls[0].action,'admin_daily');assert.equal(calls[0].body.date,'2026-09-20');assert.equal(calls[0].body.previewRole,'HR');assert(html.includes('8 ชม. 30 นาที'));assert(html.includes('ออกพัก'));assert(html.includes('data-action=\"print\"'));assert(!html.includes('data-page=\"dashboard\"'))});
test('monthly report stays available as a separate tab',async()=>{let action;const {run}=setup(async(url)=>{action=new URL(url).searchParams.get('action');return {ok:true,json:async()=>({ok:true,rows:[],period_start:'2026-09-01'})}});run("state.reportPeriod='monthly'");const html=await run('reportView()');assert.equal(action,'admin_monthly_summary');assert(html.includes('data-report-period=\"daily\"'))});
