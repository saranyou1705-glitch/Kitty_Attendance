
do $test$
declare t date:=(now() at time zone 'Asia/Bangkok')::date;e uuid:='10000000-0000-4000-8000-000000000001';r jsonb;b jsonb;rid text;
begin
 b:=kitty_staging.ot_balance(e,'USE_PRIOR',t);
 assert (b->>'minutes')::int=60;
 r:=public.kitty_staging_overtime_v1('test-ho','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'reason','auto','clientId','00000000-0000-4000-8000-000000000001'));
 rid:=r->'request'->>'id';assert (r->'request'->>'minutes')::int=60;
 r:=public.kitty_staging_overtime_v1('test-ho','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'reason','auto','clientId','00000000-0000-4000-8000-000000000001'));
 assert (r->>'replayed')::boolean;
 r:=public.kitty_staging_overtime_v1('test-hr','review',jsonb_build_object('id',rid,'decision','APPROVED'));
 assert r->'request'->>'status'='APPROVED';
 b:=kitty_staging.ot_balance(e,'MAKEUP_NEXT',t);
 assert (b->>'minutes')::int=0; -- same shortage cannot be covered twice
 update public.daily_attendance set paid_work_hours=8 where employee_id=e and work_date=t;
 b:=kitty_staging.ot_balance(e,'USE_PRIOR',t,rid::uuid);assert (b->>'minutes')::int=0; -- unused expires
 update public.daily_attendance set paid_work_hours=9 where employee_id=e and work_date=t;
 b:=kitty_staging.ot_balance(e,'USE_PRIOR',t+1);assert (b->>'source_date')::date=t;assert (b->>'source_capacity')::int=60; -- never yesterday's surplus
 update public.daily_attendance set last_out_at=null where employee_id=e and work_date=t;
 b:=kitty_staging.ot_balance(e,'USE_PRIOR',t,rid::uuid);assert b->>'settlement_state'='WAITING';assert b->>'minutes' is null;
 update public.daily_attendance set paid_work_hours=7,last_out_at=now() where employee_id=e and work_date=t;
 update public.daily_attendance set paid_work_hours=8.5 where employee_id=e and work_date=t+1;
 update kitty_staging.overtime_requests set status='CANCELLED' where id=rid::uuid;
 b:=kitty_staging.ot_balance(e,'MAKEUP_NEXT',t);assert (b->>'minutes')::int=30;assert (b->>'remaining_short_minutes')::int=30;
 -- HR cannot approve BA, and no manual amount accepted as allocation.
 r:=public.kitty_staging_overtime_v1('test-ba','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'minutes',999,'reason','auto','clientId','00000000-0000-4000-8000-000000000002'));
 assert (r->'request'->>'minutes')::int=60;
 begin perform public.kitty_staging_overtime_v1('test-hr','review',jsonb_build_object('id',r->'request'->>'id','decision','APPROVED'));raise exception 'scope failure';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 assert not has_function_privilege('anon','public.kitty_staging_overtime_v1(text,text,jsonb)','execute');
end;$test$;

