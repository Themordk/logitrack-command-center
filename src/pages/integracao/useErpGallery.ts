import { useEffect, useState, useCallback } from "react";
import { mw } from "./entidades";

export interface ErpProvedor {
  id: string;
  nome: string;
  disponivel: boolean;
  ordem: number;
}

export interface ErpIntegracao {
  erp_provedor_id: string;
  ativo: boolean | null;
  status: "ativo" | "inativo" | "erro" | string | null;
  ultimo_teste_em: string | null;
  ultimo_teste_ok: boolean | null;
  mensagem_erro: string | null;
}

export interface ErpCardData {
  provedor: ErpProvedor;
  integracao: ErpIntegracao | null;
  legadoOmie: boolean;
  ultimoLegadoEm: string | null;
}

export function useErpGallery(tenantId: string | null, empresaId: string | null, empresaVersion: number) {
  const [data, setData] = useState<ErpCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setError(null);
    try {
      const [provRes, intRes, omieRes] = await Promise.all([
        mw.from("erp_provedor").select("id,nome,disponivel,ordem").order("ordem"),
        mw
          .from("erp_integracao")
          .select("erp_provedor_id,ativo,status,ultimo_teste_em,ultimo_teste_ok,mensagem_erro")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId),
        mw
          .from("omie_config")
          .select("id,atualizado_em")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId)
          .maybeSingle(),
      ]);

      if (provRes.error) throw provRes.error;

      const provs: ErpProvedor[] = (provRes.data || []) as any;
      const ints: ErpIntegracao[] = (intRes.data || []) as any;
      const omieLegado = !intRes.error && !!omieRes.data;

      const merged: ErpCardData[] = provs.map((p) => {
        const integ = ints.find((i) => i.erp_provedor_id === p.id) || null;
        const legado = p.id === "omie" && !integ && omieLegado;
        return {
          provedor: p,
          integracao: integ,
          legadoOmie: legado,
          ultimoLegadoEm: legado ? (omieRes.data as any)?.atualizado_em ?? null : null,
        };
      });

      setData(merged);
    } catch (e: any) {
      setError(e?.message || "Erro ao carregar provedores");
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, empresaVersion]);

  return { data, loading, error, reload: load };
}
