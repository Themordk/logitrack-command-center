import { authenticateSupport, corsHeaders, jsonResponse } from "../_shared/support-auth.ts";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateSupport(req);
  if (auth.response) return auth.response;
  const admin = auth.ctx.admin as any;

  try {
    const body = await req.json();
    const nome = String(body.nome ?? "").trim();
    const slug = String(body.slug ?? "").trim().toLowerCase();
    const razaosocial = String(body.razaosocial ?? "").trim();
    const cnpj = String(body.cnpj ?? "").replace(/\D/g, "");
    const codigo = String(body.codigo ?? "").trim();

    if (nome.length < 2) return jsonResponse({ error: "Nome do tenant inválido." }, 400);
    if (!SLUG_RE.test(slug)) return jsonResponse({ error: "Slug inválido. Use letras minúsculas, números e hífen (2-40)." }, 400);
    if (razaosocial.length < 2) return jsonResponse({ error: "Razão social inválida." }, 400);
    if (cnpj.length !== 14) return jsonResponse({ error: "CNPJ deve conter 14 dígitos." }, 400);
    if (!codigo) return jsonResponse({ error: "Código da empresa é obrigatório." }, 400);

    // Unicidade do slug
    const { data: slugExists } = await admin
      .from("tenant").select("id").eq("slug", slug).maybeSingle();
    if (slugExists) return jsonResponse({ error: "Slug já em uso." }, 409);

    // Unicidade do CNPJ (global)
    const { data: cnpjExists } = await admin
      .from("empresa").select("id").eq("cnpj", cnpj).maybeSingle();
    if (cnpjExists) return jsonResponse({ error: "CNPJ já cadastrado." }, 409);

    // Cria tenant
    const { data: tenantRow, error: tenantErr } = await admin
      .from("tenant")
      .insert({ nome, slug, ativo: true })
      .select("id, nome, slug")
      .single();
    if (tenantErr) return jsonResponse({ error: `Tenant: ${tenantErr.message}` }, 400);

    // Cria empresa
    const { data: empresaRow, error: empresaErr } = await admin
      .from("empresa")
      .insert({
        tenant_id: tenantRow.id,
        razaosocial,
        cnpj,
        codigo,
        ativo: true,
      })
      .select("id, codigo, razaosocial")
      .single();

    if (empresaErr) {
      // Rollback manual
      await admin.from("tenant").delete().eq("id", tenantRow.id);
      return jsonResponse({ error: `Empresa: ${empresaErr.message}` }, 400);
    }

    return jsonResponse({ success: true, tenant: tenantRow, empresa: empresaRow });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err?.message || "Erro interno" }, 500);
  }
});
