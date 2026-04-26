import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenant_id");
    if (!tenantId) return jsonResponse({ error: "tenant_id obrigatório" }, 400);

    const admin = auth.ctx.admin as any;

    // Linha do resumo
    const { data: resumo, error: errResumo } = await admin
      .from("vw_tenant_resumo")
      .select("*")
      .eq("id", tenantId)
      .maybeSingle();
    if (errResumo) throw errResumo;
    if (!resumo) return jsonResponse({ error: "Tenant não encontrado" }, 404);

    // Empresas do tenant
    const { data: empresas } = await admin
      .from("empresa")
      .select("id, codigo, razaosocial, cnpj, ativo")
      .eq("tenant_id", tenantId)
      .order("razaosocial");

    // Contagens adicionais
    const counts: Record<string, number> = {};
    const tabelas = [
      "armazem", "endereco", "documento_entrada", "documento_saida",
      "tarefa_execucao", "hu", "perfil", "log_sessao_usuario",
    ];
    for (const t of tabelas) {
      const { count } = await admin
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      counts[t] = count || 0;
    }

    // Última sessão
    const { data: ultimaSessao } = await admin
      .from("log_sessao_usuario")
      .select("inicio_sessao, ultimo_heartbeat")
      .eq("tenant_id", tenantId)
      .order("ultimo_heartbeat", { ascending: false })
      .limit(1)
      .maybeSingle();

    return jsonResponse({
      success: true,
      tenant: resumo,
      empresas: empresas || [],
      counts,
      ultima_sessao: ultimaSessao || null,
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
