// Edge function pública: resolve tenant a partir do slug do subdomínio.
// Não requer autenticação. Sanitiza input. Retorna apenas dados públicos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

// Rate limit muito simples por IP (in-memory, reset por instância)
const RL_WINDOW_MS = 60_000;
const RL_MAX = 60;
const rlMap = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const cur = rlMap.get(ip);
  if (!cur || now > cur.reset) {
    rlMap.set(ip, { count: 1, reset: now + RL_WINDOW_MS });
    return true;
  }
  cur.count += 1;
  if (cur.count > RL_MAX) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (!rateLimit(ip)) {
      return new Response(JSON.stringify({ error: "RATE_LIMITED" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    let slug = (url.searchParams.get("slug") || "").trim().toLowerCase();

    if (!slug && (req.method === "POST")) {
      try {
        const body = await req.json();
        slug = String(body?.slug || "").trim().toLowerCase();
      } catch {
        // ignore
      }
    }

    if (!slug || !SLUG_RE.test(slug)) {
      return new Response(JSON.stringify({ error: "INVALID_SLUG" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data, error } = await supabase.rpc("fn_resolve_tenant_by_slug", { p_slug: slug });

    if (error) {
      console.error("[resolve-tenant] rpc error", error);
      return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return new Response(JSON.stringify({ error: "TENANT_NOT_FOUND" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (row.ativo !== true) {
      return new Response(
        JSON.stringify({ error: "TENANT_INACTIVE", nome: row.nome, slug: row.slug }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant: { id: row.id, nome: row.nome, slug: row.slug, ativo: true },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[resolve-tenant] fatal", e);
    return new Response(JSON.stringify({ error: "INTERNAL_ERROR" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
