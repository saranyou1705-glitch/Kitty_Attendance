// Production gateway. Deployment does not replace rapid-processor or its schedules.
// Every request is authenticated with LINE; service credentials stay server-side.
import {createHandler} from '../../../release/handler.ts';
const url=Deno.env.get('SUPABASE_URL');
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!url||!serviceKey)throw Error('MISSING_SERVER_CONFIGURATION');
Deno.serve(createHandler({url,serviceKey,clockEnabled:true}));
