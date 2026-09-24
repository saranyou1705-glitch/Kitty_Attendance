'use strict';
// Candidate only. Not loaded by the live staging or production page.
// Sequence mirrors rapid-processor downloaded 2026-09-24; backend remains authoritative.
function allowedActions(mode, events) {
  const types=[...events].sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at))).map(e=>e.event_type);
  const last=types.at(-1),has=t=>types.includes(t);
  if(mode==='DRIVER') return [
    !has('IN')&&!has('OUT')&&'IN',
    has('IN')&&!has('OUT')&&'OUT',
    has('IN')&&!has('OUT')&&!has('BREAK_OUT')&&'BREAK_OUT',
    has('IN')&&!has('OUT')&&has('BREAK_OUT')&&!has('BREAK_IN')&&'BREAK_IN'
  ].filter(Boolean);
  if(mode==='MULTI_BRANCH') return [
    !types.length&&'DAY_IN',
    ['DAY_IN','BRANCH_OUT'].includes(last)&&'BRANCH_IN',
    ['BRANCH_IN','BREAK_IN'].includes(last)&&'BREAK_OUT',
    last==='BREAK_OUT'&&'BREAK_IN',
    ['BRANCH_IN','BREAK_IN'].includes(last)&&'BRANCH_OUT',
    ['DAY_IN','BRANCH_OUT'].includes(last)&&'DAY_OUT'
  ].filter(Boolean);
  if(!['STANDARD','STOCK_REFILL'].includes(mode))return [];
  return [!types.length&&'IN',last==='IN'&&'BREAK_OUT',last==='BREAK_OUT'&&'BREAK_IN',last==='BREAK_IN'&&'OUT'].filter(Boolean);
}
function createRecorder({loadToday,getPosition,record,clock=()=>new Date()}) {
  let busy=false,uncertain=false;
  return {
    get busy(){return busy},
    get uncertain(){return uncertain},
    async reconcile(){await loadToday();uncertain=false},
    async submit(eventType) {
      if(busy)throw Error('RECORD_IN_PROGRESS');
      if(uncertain)throw Error('RECONCILE_REQUIRED');
      busy=true;
      try{
        // Refresh first; never submit an action allowed only by a stale screen.
        const today=await loadToday();
        if(!today.employee?.active)throw Error('EMPLOYEE_INACTIVE');
        if(!allowedActions(today.employee.attendance_mode,today.events||[]).includes(eventType))throw Error('ACTION_NOT_AVAILABLE');
        const {coords}=await getPosition();
        if(!Number.isFinite(coords.latitude)||Math.abs(coords.latitude)>90||!Number.isFinite(coords.longitude)||Math.abs(coords.longitude)>180||!Number.isFinite(coords.accuracy)||coords.accuracy<0)throw Error('INVALID_LOCATION');
        const at=clock();
        const payload={eventType,eventAt:at.toISOString(),workDate:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(at),latitude:coords.latitude,longitude:coords.longitude,gpsAccuracy:coords.accuracy};
        // Deliberately no retries: a timeout may already have inserted the event.
        uncertain=true;
        const result=await record(payload);
        if(!result?.ok)throw Error(result?.error||'RECORD_FAILED');
        const refreshed=await loadToday();
        uncertain=false;
        return refreshed;
      }finally{busy=false}
    }
  };
}
module.exports={allowedActions,createRecorder};
