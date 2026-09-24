do $test$
declare t date:=(now() at time zone 'Asia/Bangkok')::date; b jsonb;r jsonb;use_id text;makeup_id text;
begin
 b:=kitty_staging.ot_balance('10000000-0000-4000-8000-000000000001','USE_PRIOR',t);
 assert (b->>'source_date')::date=t-1;assert (b->>'available_minutes')::integer=60;
 r:=public.kitty_staging_overtime_v1('test-ho','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'minutes',30,'reason','test','clientId','00000000-0000-4000-8000-000000000001'));
 use_id:=r->'request'->>'id';
 b:=kitty_staging.ot_balance('10000000-0000-4000-8000-000000000001','MAKEUP_NEXT',t);
 assert (b->>'target_date')::date=t+1;assert (b->>'available_minutes')::integer=30;
 r:=public.kitty_staging_overtime_v1('test-ho','submit',jsonb_build_object('mode','MAKEUP_NEXT','date',t,'minutes',30,'reason','test','clientId','00000000-0000-4000-8000-000000000002'));
 makeup_id:=r->'request'->>'id';
 begin
  perform public.kitty_staging_overtime_v1('test-ho','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'minutes',1,'reason','test','clientId','00000000-0000-4000-8000-000000000003'));
  raise exception 'Expected overbooking rejection';
 exception when raise_exception then assert sqlerrm='OT_INSUFFICIENT_MINUTES';end;
 r:=public.kitty_staging_overtime_v1('test-hr','review',jsonb_build_object('id',use_id,'decision','APPROVED'));
 assert r->'request'->>'status'='APPROVED';
 r:=public.kitty_staging_overtime_v1('test-hr','review',jsonb_build_object('id',use_id,'decision','APPROVED'));
 assert (r->>'replayed')::boolean;
 begin
  perform public.kitty_staging_overtime_v1('test-ba','cancel',jsonb_build_object('id',makeup_id));
  raise exception 'Expected ownership rejection';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 r:=public.kitty_staging_overtime_v1('test-ho','cancel',jsonb_build_object('id',makeup_id));
 assert r->'request'->>'status'='CANCELLED';
 b:=kitty_staging.ot_balance('10000000-0000-4000-8000-000000000001','MAKEUP_NEXT',t);
 assert (b->>'available_minutes')::integer=30;
 -- Weekend/holiday skipping uses explicit schedules, never absent dates.
 b:=kitty_staging.ot_balance('10000000-0000-4000-8000-000000000003','USE_PRIOR',t);
 assert (b->>'source_date')::date=t-3;assert (b->>'available_minutes')::integer=60;
 delete from public.employee_schedules where employee_id='10000000-0000-4000-8000-000000000003' and work_date=t-2;
 begin
  perform kitty_staging.ot_balance('10000000-0000-4000-8000-000000000003','USE_PRIOR',t);
  raise exception 'Expected missing schedule rejection';
 exception when raise_exception then assert sqlerrm='OT_SCHEDULE_REQUIRED';end;
 r:=public.kitty_staging_overtime_v1('test-ba','submit',jsonb_build_object('mode','USE_PRIOR','date',t,'minutes',10,'reason','test','clientId','00000000-0000-4000-8000-000000000004'));
 begin
  perform public.kitty_staging_overtime_v1('test-hr','review',jsonb_build_object('id',r->'request'->>'id','decision','APPROVED'));
  raise exception 'Expected HR scope rejection';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 r:=public.kitty_staging_overtime_v1('test-hr','queue');
 assert jsonb_array_length(r->'rows')=0;
 r:=public.kitty_staging_overtime_v1('test-admin','queue');
 assert jsonb_array_length(r->'rows')=1;
 assert not has_function_privilege('anon','public.kitty_staging_overtime_v1(text,text,jsonb)','execute');
end;$test$;
