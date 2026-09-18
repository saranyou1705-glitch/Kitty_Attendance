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
test('older request cannot replace a newer page',async()=>{
 let release;const {run,node}=setup(async()=>{await new Promise(resolve=>release=resolve);return {ok:true,json:async()=>({ok:true,summary:{},rows:[]})}});
 run("state.connected=true;state.role='admin';state.page='dashboard'");const first=run('render()');run("state.page='settings'");await run('render()');release();await first;assert(node('#content').innerHTML.includes('ตั้งค่าระบบ'));assert(!node('#content').innerHTML.includes('เข้างานแล้ว'));
});
