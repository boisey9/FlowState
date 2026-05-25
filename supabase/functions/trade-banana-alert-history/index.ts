import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) throw new Error("Missing Supabase environment secrets");

    const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 250);

    const { data, error } = await supabase
      .from("trade_banana_alert_events")
      .select("id, created_at, symbol, timeframe, alert_level, current_regime, current_close, bull_probability, bear_probability, directional_edge, data_quality_score, as_of, telegram_sent, telegram_error, payload")
      .eq("telegram_sent", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = (data || []).map((row) => ({
      ...row,
      message: row.payload?.analysis?.decision?.detail || row.payload?.telegram_message || "Telegram alert sent.",
    }));

    return json({ ok: true, rows });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
