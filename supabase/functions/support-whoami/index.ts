import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;

  return jsonResponse({
    success: true,
    nome: auth.ctx.supportNome,
    email: auth.ctx.email,
  });
});
