const {test}=require('node:test'),assert=require('node:assert/strict');
const ui=require('./hr-access-ui.js');
test('HR signup does not ask applicants to type a LINE ID or choose their own role',()=>{
 const html=ui.registration(null);assert(html.includes('name="name"'));assert(!html.includes('name="line'));assert(!html.includes('<select'));assert(!html.includes('password'));
});
test('only pending requests get grant buttons; names and LINE IDs are escaped',()=>{
 const html=ui.management([{id:'r',version:1,status:'PENDING',name:'<script>',line_user_id:'"><script>'},{id:'approved',status:'APPROVED',name:'HR',version:2}]);
 assert(!html.includes('<script>'));assert(html.includes('data-hr-decision="grant"'));assert(html.includes('data-hr-decision="revoke"'));
 assert(!ui.registration({name:'N',status:'REVOKED'}).includes('<form'));
});
test('role decision requires explicit confirmation and sends no caller-provided LINE identity',async()=>{
 const calls=[];const ctl=ui.createController({api:async(...args)=>calls.push(args),confirm:async text=>{assert(text.includes('verified-target'));return true}});
 await ctl.review('grant',{id:'r',version:1,name:'HR',line_user_id:'verified-target'});
 assert.deepEqual(calls,[['admin_hr_grant',{registrationId:'r',version:1}]]);
});
test('cancelled confirmation never sends a role change',async()=>{
 const ctl=ui.createController({api:async()=>{throw Error('must not write')},confirm:async()=>false});
 assert.equal(await ctl.review('revoke',{name:'HR',line_user_id:'line'}),null);
});
