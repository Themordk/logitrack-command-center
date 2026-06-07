import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EsquemaCampo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "senha";
  obrigatorio?: boolean;
  placeholder?: string;
  padrao?: string;
};

const SECRET_KEY_RE = /(secret|senha|password|token|key)/i;

function mask(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.length <= 4) return "***";
  return s.slice(0, 4) + "***";
}

function maskObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = SECRET_KEY_RE.test(k) ? mask(v) : v;
  }
  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  let logCtx: Record<string, unknown> = { acao: "salvar-erp-credenciais" };

  try {
    // 1) Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ sucesso: false, codigo: "unauthorized", mensagem: "JWT ausente" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) {
      return json({ sucesso: false, codigo: "unauthorized", mensagem: "JWT inválido" }, 401);
    }
    const authUserId = claimsRes.claims.sub as string;

    // 2) Body (aceita snake_case e camelCase)
    const body = await req.json().catch(() => ({} as any));
    const erp_id: string = body?.erp_id ?? body?.erpId;
    const empresa_id: string = body?.empresa_id ?? body?.empresaId;
    const credenciais: Record<string, unknown> =
      body?.credenciais && typeof body.credenciais === "object" ? body.credenciais : {};
    const ativo: boolean = body?.ativo === false ? false : true;

    if (!erp_id) return json({ sucesso: false, codigo: "payload_invalido", mensagem: "erp_id é obrigatório" }, 400);
    if (!empresa_id) return json({ sucesso: false, codigo: "payload_invalido", mensagem: "empresa_id é obrigatório" }, 400);

    logCtx = {
      ...logCtx,
      auth_user_id: authUserId,
      erp_id,
      empresa_id,
      ativo,
      campos: maskObject(credenciais),
    };
    console.log("[salvar-erp-credenciais] inicio", logCtx);

    // 3) Resolve tenant + autorização
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: usuario, error: usuarioErr } = await admin
      .from("usuario")
      .select("id, tenant_id, empresa_id, tipo_usuario, ativo")
      .eq("auth_user_id", authUserId)
      .eq("ativo", true)
      .maybeSingle();

    if (usuarioErr || !usuario) {
      console.error("[salvar-erp-credenciais] usuario não encontrado", usuarioErr);
      return json({ sucesso: false, codigo: "forbidden", mensagem: "Usuário não autorizado" }, 403);
    }

    const tenant_id = usuario.tenant_id as string;

    // Empresa pertence ao tenant?
    const { data: empresaRow } = await admin
      .from("empresa")
      .select("id, tenant_id")
      .eq("id", empresa_id)
      .maybeSingle();
    if (!empresaRow || empresaRow.tenant_id !== tenant_id) {
      return json(
        { sucesso: false, codigo: "forbidden", mensagem: "empresa_id não pertence ao tenant" },
        403,
      );
    }

    // Isolamento 1:1 (não-admin só pode mexer na própria empresa)
    const isAdmin = usuario.tipo_usuario === "ADMINISTRADOR";
    if (!isAdmin && usuario.empresa_id && usuario.empresa_id !== empresa_id) {
      return json(
        { sucesso: false, codigo: "forbidden", mensagem: "empresa_id não corresponde ao usuário" },
        403,
      );
    }

    const mw = admin.schema("middleware" as any);

    // 4) Provedor
    const { data: prov, error: provErr } = await (mw as any)
      .from("erp_provedor")
      .select("id, nome, disponivel, esquema_credencial")
      .eq("id", erp_id)
      .maybeSingle();
    if (provErr) {
      console.error("[salvar-erp-credenciais] erro buscando provedor", provErr);
      return json({ sucesso: false, codigo: "erro_persistencia", mensagem: "Erro ao consultar provedor" }, 500);
    }
    if (!prov) return json({ sucesso: false, codigo: "erp_nao_encontrado", mensagem: "ERP não encontrado" }, 404);
    if (prov.disponivel === false) {
      return json({ sucesso: false, codigo: "erp_indisponivel", mensagem: "ERP indisponível" }, 400);
    }
    const esquema: EsquemaCampo[] = Array.isArray(prov.esquema_credencial) ? prov.esquema_credencial : [];

    // 5) Registro existente (para preservar senhas em branco)
    const { data: existente } = await (mw as any)
      .from("erp_integracao")
      .select("id, credenciais")
      .eq("tenant_id", tenant_id)
      .eq("empresa_id", empresa_id)
      .eq("erp_provedor_id", erp_id)
      .maybeSingle();
    const credAnteriores: Record<string, unknown> =
      existente?.credenciais && typeof existente.credenciais === "object"
        ? (existente.credenciais as Record<string, unknown>)
        : {};

    // 6) Validação e composição final
    const finais: Record<string, unknown> = {};
    const faltantes: string[] = [];

    for (const campo of esquema) {
      const incoming = (credenciais as any)[campo.chave];
      const valor = typeof incoming === "string" ? incoming.trim() : incoming ?? "";
      const vazio = valor === "" || valor == null;

      if (vazio) {
        if (campo.tipo === "senha" && credAnteriores[campo.chave] != null && credAnteriores[campo.chave] !== "") {
          finais[campo.chave] = credAnteriores[campo.chave];
          continue;
        }
        if (campo.padrao != null && campo.padrao !== "") {
          finais[campo.chave] = campo.padrao;
          continue;
        }
        if (campo.obrigatorio) {
          faltantes.push(campo.chave);
        }
        continue;
      }
      finais[campo.chave] = valor;
    }

    if (faltantes.length > 0) {
      return json(
        {
          sucesso: false,
          codigo: "campos_obrigatorios",
          campos: faltantes,
          mensagem: `Campos obrigatórios ausentes: ${faltantes.join(", ")}`,
        },
        400,
      );
    }

    // 7) Upsert erp_integracao
    const nowIso = new Date().toISOString();
    let savedId: string | null = existente?.id ?? null;

    if (existente?.id) {
      const { error } = await (mw as any)
        .from("erp_integracao")
        .update({
          credenciais: finais,
          ativo,
          status: "ativo",
          mensagem_erro: null,
          atualizado_em: nowIso,
          atualizado_por: authUserId,
        })
        .eq("id", existente.id);
      if (error) {
        console.error("[salvar-erp-credenciais] update erp_integracao", error);
        return json({ sucesso: false, codigo: "erro_persistencia", mensagem: "Erro ao salvar credenciais" }, 500);
      }
    } else {
      const { data, error } = await (mw as any)
        .from("erp_integracao")
        .insert({
          tenant_id,
          empresa_id,
          erp_provedor_id: erp_id,
          credenciais: finais,
          ativo,
          status: "ativo",
          mensagem_erro: null,
          criado_por: authUserId,
          atualizado_por: authUserId,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[salvar-erp-credenciais] insert erp_integracao", error);
        return json({ sucesso: false, codigo: "erro_persistencia", mensagem: "Erro ao salvar credenciais" }, 500);
      }
      savedId = data?.id ?? null;
    }

    // 8) Compatibilidade Omie
    if (erp_id === "omie") {
      const baseUrl = (finais.url_base as string) || "https://app.omie.com.br/api/v1";
      const omiePatch: Record<string, unknown> = {
        app_key: (finais.app_key as string) ?? null,
        omie_base_url: baseUrl,
        ativo,
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
        const { error } = await (mw as any).from("omie_config").update(omiePatch).eq("id", omieExist.id);
        if (error) console.error("[salvar-erp-credenciais] update omie_config", error);
      } else if (omiePatch.app_key && omiePatch.app_secret) {
        const { error } = await (mw as any)
          .from("omie_config")
          .insert({ ...omiePatch, tenant_id, empresa_id });
        if (error) console.error("[salvar-erp-credenciais] insert omie_config", error);
      }
    }

    console.log("[salvar-erp-credenciais] ok", { ...logCtx, id: savedId, resultado: "ok" });
    return json({ sucesso: true, id: savedId });
  } catch (e: any) {
    console.error("[salvar-erp-credenciais] erro inesperado", e?.message || e, logCtx);
    return json({ sucesso: false, codigo: "erro_interno", mensagem: "Erro interno" }, 500);
  }
});
