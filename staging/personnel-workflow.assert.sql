
do $test$
declare r jsonb;p jsonb;rid text;before_staff jsonb;
begin
 select jsonb_agg(to_jsonb(e)) into before_staff from public.employees e;
 r:=public.kitty_staging_personnel_v1('new-person','register','{"name":"New Person"}');rid:=r->'registration'->>'id';
 assert r->'registration'->>'status'='PENDING';
 r:=public.kitty_staging_personnel_v1('new-person','register','{"name":"Second submit"}');assert r->'registration'->>'id'=rid;
 r:=public.kitty_staging_personnel_v1('test-hr','list');assert jsonb_array_length(r->'registrations')=1;assert (r->'registrations'->0->>'unread')::boolean;
 perform public.kitty_staging_personnel_v1('test-hr','read',jsonb_build_object('registrationId',rid));
 r:=public.kitty_staging_personnel_v1('test-hr','list');assert not (r->'registrations'->0->>'unread')::boolean;
 begin perform public.kitty_staging_personnel_v1('new-person','save','{}');raise exception 'Expected forbidden';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 begin perform public.kitty_staging_personnel_v1('test-hr','get','{"employeeId":"10000000-0000-4000-8000-000000000002"}');raise exception 'Expected forbidden BA';
 exception when raise_exception then assert sqlerrm='FORBIDDEN';end;
 p:=jsonb_build_object('registrationId',rid,'profileId','30000000-0000-4000-8000-000000000001','version',0,'employee_code','HO099','name','New Person','weekly_dayoffs',jsonb_build_array('SAT','SUN'));
 r:=public.kitty_staging_personnel_v1('test-hr','save',p);assert r->'profile'->'weekly_dayoffs'='["SAT","SUN"]'::jsonb;
 r:=public.kitty_staging_personnel_v1('new-person','mine');assert r->'registration'->>'status'='READY';
 r:=public.kitty_staging_personnel_v1('test-hr','list');assert jsonb_array_length(r->'registrations')=0;
 begin perform public.kitty_staging_personnel_v1('test-hr','save',p);raise exception 'Expected stale';exception when raise_exception then assert sqlerrm='STALE_PROFILE';end;
 p:='{"employeeId":"10000000-0000-4000-8000-000000000001","version":0,"employee_code":"HO001","name":"Changed in sandbox","weekly_dayoffs":["MON"]}';
 r:=public.kitty_staging_personnel_v1('test-hr','save',p);
 assert r->'profile'->>'name'='Changed in sandbox';assert r->'profile'->'weekly_dayoffs'='["MON"]'::jsonb;
 begin perform public.kitty_staging_personnel_v1('test-hr','save',p||'{"profileId":"30000000-0000-4000-8000-000000000001"}');raise exception 'Expected mixed target rejection';
 exception when raise_exception then assert sqlerrm='INVALID_REQUEST';end;
 begin perform public.kitty_staging_personnel_v1('test-hr','save',p||'{"version":1,"weekly_dayoffs":["BOGUS"]}');raise exception 'Expected day rejection';
 exception when raise_exception then assert sqlerrm='INVALID_DAYOFF';end;
 assert (select jsonb_agg(to_jsonb(e)) from public.employees e)=before_staff;
 assert (select count(*) from kitty_staging.personnel_audit)=2;
 assert not has_function_privilege('anon','public.kitty_staging_personnel_v1(text,text,jsonb)','execute');
end;$test$;

