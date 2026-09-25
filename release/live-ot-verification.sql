select to_regclass('kitty_live.overtime_requests') is not null as live_ot_installed,
 has_function_privilege('anon','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as anon_may_execute,
 has_function_privilege('authenticated','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as browser_may_execute,
 has_function_privilege('service_role','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as service_may_execute;
select tgname,tgenabled from pg_trigger where tgname in ('kitty_live_ot_daily','kitty_live_ot_deleted','kitty_live_ot_schedule','kitty_live_leave_adjustment') order by tgname;
select count(*) as live_requests,count(*) filter(where status='APPROVED') as approved_live_requests,
 has_function_privilege('anon','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as anon_may_execute,
 has_function_privilege('authenticated','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as browser_may_execute,
 has_function_privilege('service_role','public.kitty_live_overtime_v1(text,text,jsonb)','EXECUTE') as service_may_execute,
 (select jsonb_object_agg(tgname,tgenabled) from pg_trigger where tgname in ('kitty_live_ot_daily','kitty_live_ot_deleted','kitty_live_ot_schedule','kitty_live_leave_adjustment')) as triggers
 from kitty_live.overtime_requests;
