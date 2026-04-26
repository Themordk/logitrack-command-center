import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");

    let query = (auth.ctx.admin as any)
      .from("support_chamado")
      .select("id, tenant_id, titulo, descricao, status, prioridade, criado_em, atendido_em")
      .order("criado_em", { ascending: false });

    if (tenantId) query = query.eq("tenant_id", tenantId);

    const { data, error } = await query;
    if (error) throw error;

    return jsonResponse({ success: true, chamados: data || [] });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
