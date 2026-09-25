// Production gateway. No arbitrary proxy action; unconnected features fail closed.
// HR access never creates a public.admins row.
type Dependencies = {
 verifyLine:(token:string)=>Promise<{userId:string,displayName?:string,pictureUrl?:string}>;
 access:(actor:string,operation:string,payload:Record<string,unknown>)=>Promise<any>;
 legacy:(token:string,action:string,payload:Record<string,unknown>)=>Promise<any>;
 requests?:(actor:string,operation:string,payload:Record<string,unknown>)=>Promise<any>;
 overtime?:(actor:string,operation:string,payload:Record<string,unknown>)=>Promise<any>;
};
export function createGateway(deps:Dependencies){
 return async function handle(token:string,action:string,body:Record<string,any>={}){
  if(!token)throw Error('MISSING_LINE_TOKEN');
  const profile=await deps.verifyLine(token);
  if(!profile?.userId)throw Error('INVALID_LINE_TOKEN');
  const roles:Record<string,string>={hr_register:'register',admin_hr_list:'list',admin_hr_grant:'grant',admin_hr_reject:'reject',admin_hr_revoke:'revoke'};
  if(Object.prototype.hasOwnProperty.call(roles,action)){
   return deps.access(profile.userId,roles[action],body);
  }
  const requests:Record<string,string>={live_request_submit:'submit',live_request_review:'review',live_request_cancel:'cancel',live_request_mine:'mine',live_request_queue:'queue',live_request_report:'report'};
  if(Object.prototype.hasOwnProperty.call(requests,action)){
   if(!deps.requests)throw Error('ACTION_NOT_CONNECTED');
   return deps.requests(profile.userId,requests[action],body);
  }
  const overtime:Record<string,string>={live_ot_submit:'submit',live_ot_review:'review',live_ot_cancel:'cancel',live_ot_mine:'mine',live_ot_queue:'queue',live_ot_report:'report',live_ot_balance:'balance'};
  if(Object.prototype.hasOwnProperty.call(overtime,action)){
   if(!deps.overtime)throw Error('ACTION_NOT_CONNECTED');
   return deps.overtime(profile.userId,overtime[action],body);
  }
  const identity=await deps.access(profile.userId,'identity',{});
  if(!identity?.ok)throw Error('IDENTITY_UNAVAILABLE');
  const role=identity.role;
  if(!['ADMIN','HR','EMPLOYEE'].includes(role))throw Error('INVALID_ROLE');
  if(action==='admin_update_event'){
   if(role!=='ADMIN'||body.previewRole==='HR')throw Error('ADMIN_REQUIRED');
   if(Object.keys(body).some(k=>!['eventId','eventAt','reason'].includes(k)))throw Error('INVALID_FIELDS');
   if(!/^[0-9a-f-]{36}$/i.test(body.eventId||'')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00$/.test(body.eventAt||'')||!Number.isFinite(Date.parse(body.eventAt)))throw Error('INVALID_FIELDS');
   if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw Error('INVALID_REASON');
   return deps.legacy(token,action,{eventId:body.eventId,eventAt:body.eventAt,reason:body.reason.trim()});
  }
  if(action==='bootstrap'){
   const original=await deps.legacy(token,'bootstrap',{});
   if(!original?.ok)throw Error(original?.error||'BOOTSTRAP_FAILED');
   return {...original,profile,isAdmin:role==='ADMIN'||role==='HR',adminRole:role==='EMPLOYEE'?null:role,hrRegistration:identity.registration||null};
  }
  // Only own attendance endpoints can pass through. Legacy server derives employee from LINE token.
  const readFields:Record<string,string[]>={today:['date'],employee_month:['month']};
  if(Object.prototype.hasOwnProperty.call(readFields,action)){
   if(Object.keys(body).some(k=>!readFields[action].includes(k)))throw Error('INVALID_FIELDS');
   return deps.legacy(token,action,body);
  }
  if(action==='record'){
   const fields=['eventType','eventAt','workDate','latitude','longitude','gpsAccuracy'];
   if(Object.keys(body).some(k=>!fields.includes(k)))throw Error('INVALID_FIELDS');
   const boot=await deps.legacy(token,'bootstrap',{});
   if(!boot?.ok||!boot.employee?.active)throw Error('ACTIVE_EMPLOYEE_REQUIRED');
   if(['STANDARD','STOCK_REFILL'].includes(boot.employee.attendance_mode)){
    const today=await deps.legacy(token,'today',{date:body.workDate});
    if(!today?.ok||!Array.isArray(today.events))throw Error('SERVICE_UNAVAILABLE');
    const last=[...today.events].sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at))).at(-1)?.event_type;
    const next=last===undefined?'IN':({IN:'BREAK_OUT',BREAK_OUT:'BREAK_IN',BREAK_IN:'OUT'} as Record<string,string>)[last];
    if(body.eventType!==next)throw Error('INVALID_STANDARD_SEQUENCE');
   }
   const allowed=['IN','OUT','BREAK_OUT','BREAK_IN','DAY_IN','DAY_OUT','BRANCH_IN','BRANCH_OUT'];
   if(!allowed.includes(body.eventType))throw Error('INVALID_EVENT_TYPE');
   if(!Number.isFinite(body.latitude)||Math.abs(body.latitude)>90||!Number.isFinite(body.longitude)||Math.abs(body.longitude)>180||!Number.isFinite(body.gpsAccuracy)||body.gpsAccuracy<0)throw Error('INVALID_LOCATION');
   // Keep original GPS, schedule, sequence and recalculate checks in the original service.
   return deps.legacy(token,'record',body);
  }
  // Do not forward HR/admin arbitrary operations to legacy's overly broad admin gate.
  throw Error('ACTION_NOT_CONNECTED');
 };
}
