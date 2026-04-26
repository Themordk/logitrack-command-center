// Helper compartilhado para validar usuários de Suporte da Plataforma.
// Cada edge function de suporte importa via path relativo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPPORT_EMAIL_WHITELIST = ["suporte.corelogitrack@gmail.com"];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface SupportContext {
  authUid: string;
  email: string;
  supportId: string;
  supportNome: string;
  // deno-lint-ignore no-explicit-any
  admin: any;
}

/**
 * Valida JWT, confirma whitelist de e-mail e existência ativa em platform_support_user.
 * Retorna `{ ctx }` em sucesso ou `{ response }` com Response pronta para ser retornada.
 */
export async function authenticateSupport(req: Request): Promise<
  { ctx: SupportContext; response?: never } | { ctx?: never; response: Response }
> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { response: jsonResponse({ error: "Não autorizado." }, 401) };
  }
  const token = authHeader.replace("Bearer ", "");

  const supabaseAuth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return { response: jsonResponse({ error: "Token inválido." }, 401) };
  }

  const authUid = claimsData.claims.sub as string;
  const email = String(claimsData.claims.email || "").toLowerCase();

  if (!SUPPORT_EMAIL_WHITELIST.includes(email)) {
    return { response: jsonResponse({ error: "Acesso restrito ao suporte." }, 403) };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: sup, error: supErr } = await admin
    .from("platform_support_user")
    .select("id, nome, ativo")
    .eq("auth_user_id", authUid)
    .maybeSingle();

  if (supErr || !sup || !sup.ativo) {
    return { response: jsonResponse({ error: "Usuário de suporte não autorizado." }, 403) };
  }

  return {
    ctx: {
      authUid,
      email,
      supportId: sup.id as string,
      supportNome: sup.nome as string,
      admin,
    },
  };
}
