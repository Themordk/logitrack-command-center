import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const [provRes, credRes] = await Promise.all([
        (supabase as any).rpc("integracao_listar_provedores"),
        (supabase as any).rpc("integracao_get_credenciais", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_erp_provedor_id: null,
        }),
      ]);

      if (provRes.error) throw provRes.error;

      const provs: ErpProvedor[] = (provRes.data || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        disponivel: p.disponivel !== false,
        ordem: p.ordem ?? 0,
      }));
      const creds: any[] = credRes.data || [];

      const merged: ErpCardData[] = provs
        .sort((a, b) => a.ordem - b.ordem)
        .map((p) => {
          const c = creds.find((x: any) => x.erp_provedor_id === p.id) || null;
          const integ: ErpIntegracao | null = c
            ? {
                erp_provedor_id: p.id,
                ativo: true,
                status: "ativo",
                ultimo_teste_em: null,
                ultimo_teste_ok: null,
                mensagem_erro: null,
              }
            : null;
          return {
            provedor: p,
            integracao: integ,
            legadoOmie: false,
            ultimoLegadoEm: null,
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
