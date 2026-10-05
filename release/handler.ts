import {createGateway} from './live-gateway.ts';
type Runtime={url:string;serviceKey:string;clockEnabled:boolean;fetcher?:typeof fetch};
export function createHandler(runtime:Runtime){
 const fetcher=runtime.fetcher||fetch;
 const base=new URL(runtime.url);
 if(base.protocol!=='https:'||base.hostname!=='rlqecfzddxpywbbbiirg.supabase.co')throw Error('INVALID_BACKEND');
 const legacyURL=new URL('/functions/v1/rapid-processor',base);
 const call=createGateway({
  monthSchedules:async(actor,month)=>{
   const read=async(path:string)=>{
    const response=await fetcher(new URL(path,base),{headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey}});
    if(!response.ok)throw Error('SERVICE_UNAVAILABLE');
    const rows=await response.json();if(!Array.isArray(rows))throw Error('SERVICE_UNAVAILABLE');return rows;
   };
   const employees=await read('/rest/v1/employees?select=id&line_user_id=eq.'+encodeURIComponent(actor));
   if(employees.length!==1)throw Error('EMPLOYEE_REQUIRED');
   const [year,number]=month.split('-').map(Number);
   const end=number===12?`${year+1}-01-01`:`${year}-${String(number+1).padStart(2,'0')}-01`;
   return read('/rest/v1/employee_schedules?select=work_date,schedule_status,required_hours&employee_id=eq.'+encodeURIComponent(employees[0].id)+'&work_date=gte.'+month+'-01&work_date=lt.'+end+'&order=work_date.asc');
  },
  driverWorkDate:async actor=>{
   const read=async(path:string)=>{
    const response=await fetcher(new URL(path,base),{headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey}});
    if(!response.ok)throw Error('SERVICE_UNAVAILABLE');
    const rows=await response.json();if(!Array.isArray(rows))throw Error('SERVICE_UNAVAILABLE');return rows;
   };
   const employees=await read('/rest/v1/employees?select=id,attendance_mode,active&line_user_id=eq.'+encodeURIComponent(actor));
   if(employees.length!==1||!employees[0].active||employees[0].attendance_mode!=='DRIVER')throw Error('ACTIVE_EMPLOYEE_REQUIRED');
   const events=await read('/rest/v1/attendance_events?select=event_type,work_date,event_at&employee_id=eq.'+encodeURIComponent(employees[0].id)+'&event_type=in.(IN,OUT)&order=event_at.desc,created_at.desc&limit=1');
   const latest=events[0];
   if(latest?.event_type!=='IN')return null;
   if(!/^\d{4}-\d{2}-\d{2}$/.test(latest.work_date||'')||!Number.isFinite(Date.parse(latest.event_at))||Date.parse(latest.event_at)>Date.now())throw Error('SERVICE_UNAVAILABLE');
   return latest.work_date;
  },
  employee:async(actor,operation,payload)=>{
   const rpc=operation==='live_employee_activate'?'kitty_live_activate_employee':'kitty_live_employee_office';
   const response=await fetcher(new URL('/rest/v1/rpc/'+rpc,base),{method:'POST',headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({actor,payload})});
   const result=await response.json();if(!response.ok)throw Error(result.message||'EMPLOYEE_SERVICE_ERROR');return result;
  },
  overtime:async(actor,operation,payload)=>{
   const response=await fetcher(new URL('/rest/v1/rpc/kitty_live_overtime_v1',base),{method:'POST',headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({actor,operation,payload})});
   const result=await response.json();
   if(!response.ok)throw Error(result.message||'OT_SERVICE_ERROR');
   return result;
  },
  requests:async(actor,operation,payload)=>{
   const response=await fetcher(new URL(operation==='history'?'/rest/v1/rpc/kitty_live_history_v1':'/rest/v1/rpc/kitty_live_request_v1',base),{method:'POST',headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({actor,operation,payload})});
   const result=await response.json();
   if(!response.ok)throw Error(result.message||'REQUEST_SERVICE_ERROR');
   return result;
  },
  verifyLine:async token=>{
   const response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token}});
   if(!response.ok)throw Error('INVALID_LINE_TOKEN');
   return response.json();
  },
  access:async(actor,operation,payload)=>{
   const response=await fetcher(new URL('/rest/v1/rpc/kitty_live_access_v1',base),{method:'POST',headers:{apikey:runtime.serviceKey,Authorization:'Bearer '+runtime.serviceKey,'Content-Type':'application/json'},body:JSON.stringify({actor,operation,payload})});
   const result=await response.json();
   if(!response.ok)throw Error(result.message||'ACCESS_FAILED');
   return result;
  },
  legacy:async(token,action,payload)=>{
   if(['record','self_weekend_wfh'].includes(action)&&!runtime.clockEnabled)throw Error('PRODUCTION_CLOCK_NOT_ENABLED');
   const url=new URL(legacyURL);url.searchParams.set('action',action);
   const response=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json','x-line-access-token':token},body:JSON.stringify(payload)});
   const result=await response.json();
   if(!response.ok||!result.ok){
     const message=String(result.error||'LEGACY_FAILED');
     if(message.startsWith('GPS ยังไม่แม่นยำ'))throw Error('GPS_INACCURATE');
     if(message.startsWith('คุณอยู่นอกพื้นที่'))throw Error('OUTSIDE_OFFICE');
     if(message.includes('Default Office')||message==='ยังไม่ได้ตั้งค่าพิกัดและ Radius ของสาขาในระบบ')throw Error('OFFICE_NOT_CONFIGURED');
     throw Error(message);
   }
   return result;
  }
 });
 const origins=new Set(['https://saranyou1705-glitch.github.io']);
 return async(req:Request)=>{
  const origin=req.headers.get('origin');
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin&&origins.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='content-type,x-line-access-token';headers['Access-Control-Allow-Methods']='POST,OPTIONS'}
  if(origin&&!origins.has(origin))return new Response(JSON.stringify({ok:false,error:'ORIGIN_DENIED'}),{status:403,headers});
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return new Response(JSON.stringify({ok:false,error:'METHOD_NOT_ALLOWED'}),{status:405,headers});
  try{
   const body=await req.json();if(!body||typeof body!=='object'||Array.isArray(body))throw Error('INVALID_FIELDS');
   const result=await call(req.headers.get('x-line-access-token')||'',new URL(req.url).searchParams.get('action')||'bootstrap',body);
   return new Response(JSON.stringify(result),{status:200,headers});
  }catch(error){
   const message=error instanceof Error?error.message:'INTERNAL_ERROR';
   const safe=['MISSING_LINE_TOKEN','INVALID_LINE_TOKEN','INVALID_FIELDS','INVALID_NAME','ADMIN_REQUIRED','FORBIDDEN','ALREADY_ADMIN','AMBIGUOUS_IDENTITY','SELF_ROLE_CHANGE','STALE_REGISTRATION','NOT_FOUND','ALREADY_REVIEWED','NOT_APPROVED','ACTION_NOT_CONNECTED','ACTIVE_EMPLOYEE_REQUIRED','INVALID_EVENT_TYPE','INVALID_LOCATION','PRODUCTION_CLOCK_NOT_ENABLED','GPS_INACCURATE','OUTSIDE_OFFICE','OFFICE_NOT_CONFIGURED','INVALID_STANDARD_SEQUENCE','INVALID_MULTI_BRANCH_SEQUENCE','INVALID_DRIVER_ACTION'];
   const workflow=['UNAUTHENTICATED','EMPLOYEE_REQUIRED','EMPLOYEE_INACTIVE','INVALID_REQUEST','INVALID_DATE','INVALID_LEAVE','INVALID_EVENT','FUTURE_EVENT','IDEMPOTENCY_CONFLICT','ALREADY_REVIEWED','INVALID_DECISION','REJECTION_REASON_REQUIRED','INVALID_REASON','INVALID_REPORT','WORK_SCHEDULE_REQUIRED','HALF_DAY_REQUIRES_CLOCK','LEAVE_ALREADY_APPROVED','EVENT_ALREADY_EXISTS','INVALID_EVENT_ORDER','USE_ADMIN_BRANCH_CORRECTION'];
   const ot=['INVALID_OT_MODE','OT_SCHEDULE_REQUIRED','OT_SCHEDULE_CHANGED','OT_WINDOW_EXPIRED','DUPLICATE_PENDING_REQUEST','OT_OFFICE_ONLY'];
   const personnel=['OFFICE_REQUIRED','STALE_PROFILE','APPROVAL_REQUIRED','HO_ONLY','EMPLOYEE_CONFLICT','INVALID_LINE_ID','BA_BRANCH_MISMATCH'];
   const code=safe.includes(message)||workflow.includes(message)||ot.includes(message)||personnel.includes(message)?message:'SERVICE_UNAVAILABLE';
   return new Response(JSON.stringify({ok:false,error:code}),{status:code==='SERVICE_UNAVAILABLE'?503:code.includes('TOKEN')?401:['ADMIN_REQUIRED','FORBIDDEN'].includes(code)?403:400,headers});
  }
 };
}
