import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type EsquemaCampo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "senha";
  obrigatorio?: boolean;
  placeholder?: string;
  padrao?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, message: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ ok: false, message: "Unauthorized" }, 401);
    const authUserId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { erpId, tenantId, empresaId, credenciais, ativo } = body || {};
    // Aceita também {erp_id, tenant_id, empresa_id}
    const erp_id: string = erpId || body?.erp_id;
    const tenant_id: string = tenantId || body?.tenant_id;
    const empresa_id: string = empresaId || body?.empresa_id;
    if (!erp_id) return json({ ok: false, message: "erpId required" }, 400);
    if (!tenant_id || !empresa_id) return json({ ok: false, message: "tenantId/empresaId required" }, 400);
    if (!credenciais || typeof credenciais !== "object") {
      return json({ ok: false, message: "credenciais required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: u } = await admin
      .from("usuario")
      .select("id")
      .eq("auth_user_id", authUserId)
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .eq("ativo", true)
      .maybeSingle();
    if (!u) return json({ ok: false, message: "Forbidden" }, 403);

    const mw = admin.schema("middleware" as any);

    // Carrega provedor
    const { data: prov, error: provErr } = await (mw as any)
      .from("erp_provedor")
      .select("id, nome, disponivel, esquema_credencial")
      .eq("id", erp_id)
      .maybeSingle();
    if (provErr || !prov) return json({ ok: false, message: "Provedor não encontrado" }, 404);
    if (prov.disponivel === false) return json({ ok: false, message: "Provedor indisponível" }, 400);

    const esquema: EsquemaCampo[] = Array.isArray(prov.esquema_credencial) ? prov.esquema_credencial : [];

    // Carrega registro atual para preservar campos de senha vazios
    const { data: existente } = await (mw as any)
      .from("erp_integracao")
      .select("id, credenciais")
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .eq("erp_provedor_id", erp_id)
      .maybeSingle();
    const credAnteriores: Record<string, unknown> = (existente?.credenciais && typeof existente.credenciais === "object")
      ? existente.credenciais as Record<string, unknown>
      : {};

    // Monta credenciais finais com validação e preservação de senha
    const finais: Record<string, unknown> = {};
    for (const campo of esquema) {
      const incoming = (credenciais as any)[campo.chave];
      const valor = (typeof incoming === "string" ? incoming.trim() : incoming) ?? "";
      if (campo.tipo === "senha" && (valor === "" || valor == null)) {
        // preserva valor existente
        if (credAnteriores[campo.chave] != null && credAnteriores[campo.chave] !== "") {
          finais[campo.chave] = credAnteriores[campo.chave];
          continue;
        }
        if (campo.obrigatorio) {
          return json({ ok: false, message: `Campo obrigatório: ${campo.rotulo}` }, 400);
        }
        continue;
      }
      if ((valor === "" || valor == null)) {
        if (campo.padrao != null && campo.padrao !== "") {
          finais[campo.chave] = campo.padrao;
          continue;
        }
        if (campo.obrigatorio) {
          return json({ ok: false, message: `Campo obrigatório: ${campo.rotulo}` }, 400);
        }
        continue;
      }
      finais[campo.chave] = valor;
    }

    const ativoFinal = ativo !== false;
    const nowIso = new Date().toISOString();

    let savedId: string | null = existente?.id ?? null;
    if (existente?.id) {
      const { error } = await (mw as any)
        .from("erp_integracao")
        .update({
          credenciais: finais,
          ativo: ativoFinal,
          status: "ativo",
          mensagem_erro: null,
          atualizado_em: nowIso,
          atualizado_por: authUserId,
        })
        .eq("id", existente.id);
      if (error) return json({ ok: false, message: error.message }, 500);
    } else {
      const { data, error } = await (mw as any)
        .from("erp_integracao")
        .insert({
          tenant_id, empresa_id, erp_provedor_id: erp_id,
          credenciais: finais,
          ativo: ativoFinal,
          status: "ativo",
          mensagem_erro: null,
          criado_por: authUserId,
          atualizado_por: authUserId,
        })
        .select("id")
        .single();
      if (error) return json({ ok: false, message: error.message }, 500);
      savedId = data?.id ?? null;
    }

    // Compatibilidade Omie: replica em omie_config
    if (erp_id === "omie") {
      const omiePatch: any = {
        app_key: finais.app_key ?? null,
        omie_base_url: (finais.url_base as string) || "https://app.omie.com.br/api/v1",
        ativo: ativoFinal,
        updated_at: nowIso,
      };
      if (finais.app_secret) omiePatch.app_secret = finais.app_secret;

      const { data: omieExist } = await (mw as any)
        .from("omie_config")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      if (omieExist?.id) {
        await (mw as any).from("omie_config").update(omiePatch).eq("id", omieExist.id);
      } else if (omiePatch.app_key && omiePatch.app_secret) {
        await (mw as any)
          .from("omie_config")
          .insert({ ...omiePatch, tenant_id, empresa_id });
      }
    }

    return json({ ok: true, id: savedId });
  } catch (e) {
    return json({ ok: false, message: String(e?.message || e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
