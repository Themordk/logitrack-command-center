import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const authUserId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { tenant_id, empresa_id, app_key, app_secret, omie_base_url, ativo } = body || {};

    if (!tenant_id || !empresa_id) return json({ error: "tenant_id and empresa_id required" }, 400);
    if (!app_key || typeof app_key !== "string") return json({ error: "app_key required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: u } = await admin
      .from("usuario")
      .select("id")
      .eq("auth_user_id", authUserId)
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();
    if (!u) return json({ error: "Forbidden" }, 403);

    const mw = admin.schema("middleware" as any);
    const { data: existing } = await (mw as any)
      .from("omie_config")
      .select("id")
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    const patch: any = {
      app_key,
      omie_base_url: omie_base_url || "https://app.omie.com.br/api/v1",
      ativo: ativo !== false,
      updated_at: new Date().toISOString(),
    };
    if (app_secret && typeof app_secret === "string" && app_secret.length > 0) {
      patch.app_secret = app_secret;
    }

    if (existing?.id) {
      const { error } = await (mw as any).from("omie_config").update(patch).eq("id", existing.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: existing.id });
    } else {
      if (!app_secret) return json({ error: "app_secret required on first save" }, 400);
      const { data, error } = await (mw as any)
        .from("omie_config")
        .insert({ ...patch, tenant_id, empresa_id })
        .select("id")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: data.id });
    }
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
