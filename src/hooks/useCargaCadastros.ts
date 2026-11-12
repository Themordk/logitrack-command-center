import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VeiculoOpcao {
  id: string;
  descricao: string;
  placa: string | null;
  peso_total: number | null;
  m3: number | null;
  total_pallet: number | null;
}

export interface BoxOpcao {
  id: string;
  descricao: string;
  tipo_box: string | null;
}

/** Veículos ativos da empresa e boxes ativos do tenant (expedição primeiro), para a montagem de carga. */
export function useCargaCadastros(tenantId: string | null, empresaId: string | null) {
  const veiculos = useQuery({
    queryKey: ["carga-veiculos", tenantId, empresaId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VeiculoOpcao[]> => {
      let q = supabase
        .from("veiculos")
        .select("id, descricao, placa, peso_total, m3, total_pallet, empresa_id")
        .eq("tenant_id", tenantId as string)
        .eq("ativo", true)
        .order("descricao");
      if (empresaId) q = q.or(`empresa_id.eq.${empresaId},empresa_id.is.null`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(({ empresa_id: _e, ...v }) => v);
    },
  });

  const boxes = useQuery({
    queryKey: ["carga-boxes", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BoxOpcao[]> => {
      const { data, error } = await supabase
        .from("box")
        .select("id, descricao, tipo_box")
        .eq("tenant_id", tenantId as string)
        .eq("ativo", true)
        .order("descricao");
      if (error) throw error;
      return [...(data ?? [])].sort((a, b) => Number(b.tipo_box === "EXPEDICAO") - Number(a.tipo_box === "EXPEDICAO"));
    },
  });

  return { veiculos: veiculos.data ?? [], boxes: boxes.data ?? [], loading: veiculos.isLoading || boxes.isLoading };
}
