-- Synthetic identities exist only in kitty_fixture, never public.employees/admins.
do $test$
declare r jsonb; id1 text; id2 text; id3 text; n integer;
begin
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-09-01","event":"IN","time":"09:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000001"}');
 id1:=r->'request'->>'id';
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-09-01","event":"IN","time":"09:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000001"}');
 assert (r->>'replayed')::boolean, 'idempotent submit';
 begin
   perform public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-09-01","event":"IN","time":"10:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000001"}');
   raise exception 'Expected conflicting client ID rejection';
 exception when raise_exception then assert sqlerrm='IDEMPOTENCY_CONFLICT'; end;
 r:=public.kitty_staging_request_v1('test-hr','review',jsonb_build_object('id',id1,'decision','APPROVED'));
 assert (r->'request'->>'approved_sequence_in_month')::integer=1;
 assert (r->'request'->>'deduction_amount')::integer=0;
 r:=public.kitty_staging_request_v1('test-hr','review',jsonb_build_object('id',id1,'decision','APPROVED'));
 assert (r->>'replayed')::boolean, 'idempotent approval';
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-09-02","event":"IN","time":"09:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000002"}');
 id2:=r->'request'->>'id';
 r:=public.kitty_staging_request_v1('test-hr','review',jsonb_build_object('id',id2,'decision','APPROVED'));
 assert (r->'request'->>'approved_sequence_in_month')::integer=2;
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-09-03","event":"IN","time":"09:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000003"}');
 id3:=r->'request'->>'id';
 r:=public.kitty_staging_request_v1('test-hr','review',jsonb_build_object('id',id3,'decision','APPROVED'));
 assert (r->'request'->>'approved_sequence_in_month')::integer=3;
 assert (r->'request'->>'deduction_amount')::integer=200;
 begin
   perform public.kitty_staging_request_v1('test-ho','cancel',jsonb_build_object('id',id3));
   raise exception 'Expected finalized cancellation rejection';
 exception when raise_exception then assert sqlerrm='ALREADY_REVIEWED'; end;
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"correction","date":"2001-10-01","event":"IN","time":"09:00","reason":"test","clientId":"00000000-0000-4000-8000-000000000004"}');
 r:=public.kitty_staging_request_v1('test-admin','review',jsonb_build_object('id',r->'request'->>'id','decision','APPROVED'));
 assert (r->'request'->>'approved_sequence_in_month')::integer=1, 'monthly reset';
 r:=public.kitty_staging_request_v1('test-ho','submit','{"kind":"leave","date":"2001-09-04","type":"ลากิจ","duration":"HALF_DAY_AM","reason":"test","clientId":"00000000-0000-4000-8000-000000000005"}');
 assert (r->'request'->>'required_net_minutes')::integer=240;
 begin
   perform public.kitty_staging_request_v1('test-ba','cancel',jsonb_build_object('id',r->'request'->>'id'));
   raise exception 'Expected ownership rejection';
 exception when raise_exception then assert sqlerrm='FORBIDDEN'; end;
 r:=public.kitty_staging_request_v1('test-ho','cancel',jsonb_build_object('id',r->'request'->>'id'));
 assert r->'request'->>'status'='CANCELLED';
 r:=public.kitty_staging_request_v1('test-ba','submit','{"kind":"leave","date":"2001-09-04","type":"ลากิจ","duration":"FULL_DAY","reason":"test","clientId":"00000000-0000-4000-8000-000000000006"}');
 begin
   perform public.kitty_staging_request_v1('test-hr','review',jsonb_build_object('id',r->'request'->>'id','decision','APPROVED'));
   raise exception 'Expected HR BA rejection';
 exception when raise_exception then assert sqlerrm='FORBIDDEN'; end;
 r:=public.kitty_staging_request_v1('test-hr','queue');
 assert jsonb_array_length(r->'rows')=0, 'HR queue hides BA';
 r:=public.kitty_staging_request_v1('test-admin','queue');
 assert jsonb_array_length(r->'rows')=1, 'Admin retains BA access';
 r:=public.kitty_staging_request_v1('test-admin','queue','{"previewRole":"HR"}');
 assert jsonb_array_length(r->'rows')=0, 'preview narrows Admin scope';
 begin
   perform public.kitty_staging_request_v1('test-ho','queue');
   raise exception 'Expected employee queue rejection';
 exception when raise_exception then assert sqlerrm='FORBIDDEN'; end;
 r:=public.kitty_staging_request_v1('test-ho','mine');
 assert jsonb_array_length(r->'rows')=5, 'own history only';
 r:=public.kitty_staging_request_v1('test-hr','report','{"employeeId":"10000000-0000-4000-8000-000000000001","month":"2001-09"}');
 assert jsonb_array_length(r->'rows')=4, 'monthly notes';
 select count(*) into n from kitty_staging.request_audit where request_id=id1::uuid;
 assert n=2, 'one submission and approval, no replay audit duplication';
 assert not has_function_privilege('anon','public.kitty_staging_request_v1(text,text,jsonb)','execute');
 assert not has_function_privilege('authenticated','public.kitty_staging_request_v1(text,text,jsonb)','execute');
 assert not has_schema_privilege('anon','kitty_staging','usage');
end;
$test$;
