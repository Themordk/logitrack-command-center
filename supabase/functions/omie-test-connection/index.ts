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
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, message: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ ok: false, message: "Unauthorized" }, 401);
    const authUserId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { tenant_id, empresa_id, app_key: bodyKey, app_secret: bodySecret, omie_base_url: bodyUrl } = body || {};
    if (!tenant_id || !empresa_id) return json({ ok: false, message: "tenant_id and empresa_id required" }, 400);

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
    if (!u) return json({ ok: false, message: "Forbidden" }, 403);

    let app_key = bodyKey;
    let app_secret = bodySecret;
    let url_base = bodyUrl;

    if (!app_key || !app_secret || !url_base) {
      const mw = admin.schema("middleware" as any);
      const { data: cfg } = await (mw as any)
        .from("omie_config")
        .select("app_key, app_secret, omie_base_url")
        .eq("tenant_id", tenant_id)
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      app_key = app_key || cfg?.app_key;
      app_secret = app_secret || cfg?.app_secret;
      url_base = url_base || cfg?.omie_base_url || "https://app.omie.com.br/api/v1";
    }
    if (!app_key || !app_secret) {
      return json({ ok: false, message: "Credenciais ausentes" }, 200);
    }

    const url = `${String(url_base).replace(/\/$/, "")}/geral/produtos/`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        call: "ListarProdutos",
        app_key,
        app_secret,
        param: [{ pagina: 1, registros_por_pagina: 1, apenas_importado_api: "N" }],
      }),
    });
    const text = await resp.text();
    let parsed: any = {};
    try { parsed = JSON.parse(text); } catch { /* ignore */ }
    if (!resp.ok || parsed?.faultstring) {
      return json({ ok: false, message: parsed?.faultstring || `HTTP ${resp.status}` });
    }
    return json({ ok: true, message: "Conexão OK" });
  } catch (e) {
    return json({ ok: false, message: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
