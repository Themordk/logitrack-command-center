import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const filtro = (url.searchParams.get("nome") || "").trim();

    let query = (auth.ctx.admin as any)
      .from("vw_tenant_resumo")
      .select("*")
      .order("nome");

    if (filtro) {
      query = query.ilike("nome", `%${filtro}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return jsonResponse({ success: true, tenants: data || [] });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
