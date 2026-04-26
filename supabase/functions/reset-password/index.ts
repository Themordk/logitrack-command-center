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

    // Validate JWT
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

    const body = await req.json();
    const { usuario_id } = body;

    if (!usuario_id) {
      return new Response(
        JSON.stringify({ success: false, error: "usuario_id é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Derivar tenant do solicitante via auth_user_id (servidor)
    const { data: solicitante, error: solErr } = await supabaseAdmin
      .from("usuario")
      .select("id, tenant_id")
      .eq("auth_user_id", authUid)
      .maybeSingle();

    if (solErr || !solicitante?.tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário solicitante não localizado." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar usuário-alvo e validar que pertence AO MESMO tenant
    const { data: usuario, error: fetchError } = await supabaseAdmin
      .from("usuario")
      .select("id, auth_user_id, nome, tenant_id")
      .eq("id", usuario_id)
      .single();

    if (fetchError || !usuario) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (usuario.tenant_id !== solicitante.tenant_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Operação não permitida (tenant divergente)." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!usuario.auth_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Usuário sem conta de autenticação vinculada." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Reset password to default "123456"
    const { error: resetError } = await supabaseAdmin.auth.admin.updateUserById(
      usuario.auth_user_id,
      { password: "123456" }
    );

    if (resetError) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao resetar senha: ${resetError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Set flag to force password change on next login
    const { error: updateError } = await supabaseAdmin
      .from("usuario")
      .update({ deve_trocar_senha: true })
      .eq("id", usuario_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao atualizar flag: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: `Senha de ${usuario.nome} resetada com sucesso.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
