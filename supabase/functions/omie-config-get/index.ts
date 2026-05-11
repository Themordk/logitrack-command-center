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
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { tenant_id, empresa_id } = body || {};
    if (!tenant_id || !empresa_id) return json({ error: "tenant_id and empresa_id required" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Validate user belongs to tenant/empresa
    const { data: u } = await admin
      .from("usuario")
      .select("id")
      .eq("auth_user_id", claims.claims.sub)
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();
    if (!u) return json({ error: "Forbidden" }, 403);

    const mw = admin.schema("middleware" as any);
    const { data, error } = await (mw as any)
      .from("omie_config")
      .select("id, app_key, omie_base_url, ativo, app_secret")
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);

    if (!data) return json({ config: null });
    return json({
      config: {
        id: data.id,
        app_key: data.app_key,
        omie_base_url: data.omie_base_url,
        ativo: data.ativo,
        has_secret: !!(data.app_secret && data.app_secret.length > 0),
      },
    });
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
