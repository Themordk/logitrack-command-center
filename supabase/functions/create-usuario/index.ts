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
      cod_erp,
      ativo,
    } = body;

    if (!tenant_id || !empresa_id || !nome || !login || !tipo_operacao) {
      return new Response(
        JSON.stringify({ success: false, error: "Campos obrigatórios não preenchidos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Generate internal email from login
    const email = `${login}@internal.logitrack`;

    let authUserId: string | null = null;

    // If password provided, create Auth account
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

    // Insert usuario record
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

    // Assign perfil if provided
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
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
