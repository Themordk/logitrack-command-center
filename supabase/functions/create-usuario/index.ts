import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ========== 1) Validar JWT do solicitante ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Não autorizado." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ success: false, error: "Token inválido." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authUid = claimsData.claims.sub as string;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ========== 2) Derivar tenant do solicitante (servidor, NÃO do body) ==========
    const { data: solicitante, error: solErr } = await supabaseAdmin
      .from("usuario")
      .select("id, tenant_id, empresa_id")
      .eq("auth_user_id", authUid)
      .maybeSingle();

    if (solErr || !solicitante?.tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário solicitante não localizado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const {
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

    if (!empresa_id || !nome || !login || !tipo_operacao) {
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios não preenchidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FORÇA o tenant_id do solicitante (ignora qualquer valor enviado)
    const tenant_id = solicitante.tenant_id;

    // ========== 3) Validar que a empresa pertence ao tenant do solicitante ==========
    const { data: empresaOk } = await supabaseAdmin
      .from("empresa")
      .select("id")
      .eq("id", empresa_id)
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    if (!empresaOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Empresa inválida para este tenant." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ========== 4) Validar perfil (se enviado) ==========
    if (perfil_id) {
      const { data: perfilOk } = await supabaseAdmin
        .from("perfil")
        .select("id")
        .eq("id", perfil_id)
        .eq("tenant_id", tenant_id)
        .maybeSingle();
      if (!perfilOk) {
        return new Response(
          JSON.stringify({ success: false, error: "Perfil inválido para este tenant." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ========== 5) Criar conta Auth se senha fornecida ==========
    // Buscar nome do tenant para compor o domínio do e-mail sintético
    const { data: tenantRow } = await supabaseAdmin
      .from("tenant")
      .select("nome")
      .eq("id", tenant_id)
      .maybeSingle();

    const tenantSlug = ((tenantRow?.nome ?? "") as string)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove acentos
      .replace(/\s+/g, "")              // remove espaços
      .replace(/[^a-zA-Z0-9]/g, "")     // mantém apenas alfanumérico
      .toLowerCase() || "internal";

    const email = `${String(login).toLowerCase()}@${tenantSlug}.logitrack`;
    let authUserId: string | null = null;

    if (senha && senha.length >= 6) {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
      });

      if (authError) {
        return new Response(
          JSON.stringify({ success: false, error: `Erro ao criar conta Auth: ${authError.message}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      authUserId = authData.user?.id || null;
    }

    // ========== 6) Inserir usuário (já com tenant validado) ==========
    const { data: usuario, error: insertError } = await supabaseAdmin
      .from("usuario")
      .insert({
        tenant_id,
        empresa_id,
        armazem_id: armazem_id || null,
        turno_id: turno_id || null,
        nome,
        login,
        email,
        habilidade: habilidade || "TREINANDO",
        tipo_operacao,
        cod_erp: cod_erp || null,
        ativo: ativo !== false,
        auth_user_id: authUserId,
      })
      .select("id, nome, auth_user_id")
      .single();

    if (insertError) {
      if (authUserId) {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      }
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao criar usuário: ${insertError.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (perfil_id && usuario?.id) {
      await supabaseAdmin
        .from("usuario_perfil")
        .insert({
          tenant_id,
          usuario_id: usuario.id,
          perfil_id,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          auth_vinculado: !!authUserId,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
