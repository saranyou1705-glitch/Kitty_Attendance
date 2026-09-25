select jsonb_array_length(public.kitty_live_line_ot_complete((now() at time zone 'Asia/Bangkok')::date)) as completed_ot_today,
 not has_function_privilege('anon','public.kitty_live_line_ot_complete(date)','execute') as anonymous_blocked,
 not has_function_privilege('authenticated','public.kitty_live_line_ot_complete(date)','execute') as browser_blocked;
