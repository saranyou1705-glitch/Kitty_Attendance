import {createGateway} from './live-gateway.ts';
type Runtime={url:string;serviceKey:string;clockEnabled:boolean;fetcher?:typeof fetch};
export function createHandler(runtime:Runtime){
 const fetcher=runtime.fetcher||fetch;
 const base=new URL(runtime.url);
 if(base.protocol!=='https:'||base.hostname!=='rlqecfzddxpywbbbiirg.supabase.co')throw Error('INVALID_BACKEND');
 const legacyURL=new URL('/functions/v1/rapid-processor',base);
 const call=createGateway({
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
   if(action==='record'&&!runtime.clockEnabled)throw Error('PRODUCTION_CLOCK_NOT_ENABLED');
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
   const code=safe.includes(message)?message:'SERVICE_UNAVAILABLE';
   return new Response(JSON.stringify({ok:false,error:code}),{status:code==='SERVICE_UNAVAILABLE'?503:code.includes('TOKEN')?401:['ADMIN_REQUIRED','FORBIDDEN'].includes(code)?403:400,headers});
  }
 };
}
