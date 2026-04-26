import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  try {
    const body = await req.json();
    const tenantId = body?.tenant_id as string | undefined;
    const ativo = body?.ativo as boolean | undefined;

    if (!tenantId || typeof ativo !== "boolean") {
      return jsonResponse({ error: "tenant_id e ativo (boolean) obrigatórios" }, 400);
    }

    const { error } = await (auth.ctx.admin as any)
      .from("tenant")
      .update({ ativo })
      .eq("id", tenantId);

    if (error) throw error;
    return jsonResponse({ success: true });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
