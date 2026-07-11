import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://barett07.github.io',
  'Access-Control-Allow-Headers': 'Content-Type, X-FC-Passcode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TABLES = ['fc_events', 'fc_wishlist'];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  const passcode = req.headers.get('X-FC-Passcode');
  const editorPasscode = Deno.env.get('FC_EDITOR_PASSCODE');
  const viewerPasscode = Deno.env.get('FC_VIEWER_PASSCODE');

  const isEditor = !!passcode && passcode === editorPasscode;
  const isViewer = !!passcode && passcode === viewerPasscode;

  if (!isEditor && !isViewer) {
    return new Response(JSON.stringify({ error: '無權限' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const { table, action, data, id } = await req.json();

  if (!ALLOWED_TABLES.includes(table)) {
    return new Response(JSON.stringify({ error: 'Invalid table' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  // Viewer 只能對 fc_wishlist 執行 insert
  if (isViewer && !(table === 'fc_wishlist' && action === 'insert')) {
    return new Response(JSON.stringify({ error: '無權限' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  let result: { data: unknown; error: { message: string } | null };

  if (action === 'insert') {
    result = await supabase.from(table).insert(data).select().single();
  } else if (action === 'update') {
    result = await supabase.from(table).update(data).eq('id', id).select().single();
  } else if (action === 'delete') {
    result = await supabase.from(table).delete().eq('id', id).select();
  } else {
    return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
  }

  if (result.error) {
    return new Response(JSON.stringify({ error: result.error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ data: result.data }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
});
