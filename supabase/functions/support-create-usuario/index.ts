import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  try {
    const admin = auth.ctx.admin as any;
    const body = await req.json();
    const {
      tenant_id,
      empresa_id,
      armazem_id,
      turno_id,
      nome,
      login,
      senha,
      habilidade,
      tipo_operacao,
      perfil_id,
      codigo_erp,
      ativo,
    } = body;

    if (!tenant_id || !empresa_id || !nome || !login || !tipo_operacao) {
      return jsonResponse({ error: "Campos obrigatórios não preenchidos." }, 400);
    }

    // Validar empresa pertence ao tenant alvo
    const { data: empresaOk } = await admin
      .from("empresa").select("id")
      .eq("id", empresa_id).eq("tenant_id", tenant_id).maybeSingle();
    if (!empresaOk) return jsonResponse({ error: "Empresa inválida para este tenant." }, 400);

    if (perfil_id) {
      const { data: perfilOk } = await admin
        .from("perfil").select("id")
        .eq("id", perfil_id).eq("tenant_id", tenant_id).maybeSingle();
      if (!perfilOk) return jsonResponse({ error: "Perfil inválido para este tenant." }, 400);
    }

    // Compor e-mail sintético com slug do tenant
    const { data: tenantRow } = await admin
      .from("tenant").select("nome").eq("id", tenant_id).maybeSingle();

    const tenantSlug = ((tenantRow?.nome ?? "") as string)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase() || "internal";

    const email = `${String(login).toLowerCase()}@${tenantSlug}.logitrack`;

    let authUserId: string | null = null;
    if (senha && senha.length >= 6) {
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      });
      if (authError) return jsonResponse({ error: `Auth: ${authError.message}` }, 400);
      authUserId = authData.user?.id || null;
    }

    const { data: usuario, error: insertError } = await admin
      .from("usuario")
      .insert({
        tenant_id,
        empresa_id,
        armazem_id: armazem_id || null,
        turno_id: turno_id || null,
        nome, login, email,
        habilidade: habilidade || "TREINANDO",
        tipo_operacao,
        cod_erp: cod_erp || null,
        ativo: ativo !== false,
        auth_user_id: authUserId,
      })
      .select("id, nome").single();

    if (insertError) {
      if (authUserId) await admin.auth.admin.deleteUser(authUserId);
      return jsonResponse({ error: `Insert: ${insertError.message}` }, 400);
    }

    if (perfil_id && usuario?.id) {
      await admin.from("usuario_perfil").insert({
        tenant_id, usuario_id: usuario.id, perfil_id,
      });
    }

    return jsonResponse({ success: true, usuario });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
