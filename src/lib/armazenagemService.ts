import { supabase } from "@/integrations/supabase/client";
import type { DestinoArmazenagem, DestinoRecomendado } from "@/types/armazenagem";

export function lerPulmaoHabilitado(armazemId: string | null): boolean {
  try {
    return !armazemId || localStorage.getItem(`coletor_armazem_tem_pulmao_${armazemId}`) !== "N";
  } catch {
    return true;
  }
}

export function guardarPulmaoHabilitado(armazemId: string | null, habilitado: boolean): void {
  try {
    if (armazemId) localStorage.setItem(`coletor_armazem_tem_pulmao_${armazemId}`, habilitado ? "S" : "N");
  } catch { /* O destino online continua disponível mesmo sem armazenamento local. */ }
}

export function preSelecionarDestino(destino: DestinoRecomendado, pulmaoHabilitado: boolean): "PICKING" | "PULMAO" | null {
  if (destino === "SEM_DESTINO") return null;
  if (destino === "PICKING" || destino === "DIVIDIR" || (destino === "SEM_PICKING" && !pulmaoHabilitado)) return "PICKING";
  return "PULMAO";
}

export function quantidadeSugerida(destino: DestinoArmazenagem | null, escolha: "PICKING" | "PULMAO", restante: number): number {
  const rec = destino?.recomendacao;
  return escolha === "PICKING" && rec && (rec.destino === "DIVIDIR" || (rec.destino === "PICKING" && rec.quantidade_sem_destino > 0))
    ? rec.quantidade_picking
    : (destino?.quantidade ?? restante);
}

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase);

export async function buscarDestinoArmazenagem(params: {
  produtoId: string;
  tarefaId?: string | null;
  quantidade?: number | null;
}): Promise<DestinoArmazenagem> {
  const { data, error } = await rpc("rpc_coletor_armazenagem_destino", {
    p_tenant_id: localStorage.getItem("core_tenant_id"),
    p_empresa_id: localStorage.getItem("core_empresa_id"),
    p_armazem_id: localStorage.getItem("core_armazem_id"),
    p_produto_id: params.produtoId,
    p_tarefa_id: params.tarefaId ?? null,
    p_quantidade: params.quantidade ?? null,
  });
  if (error) throw new Error(error.message);
  const parsed = (typeof data === "string" ? JSON.parse(data) : data) as DestinoArmazenagem;
  if (!parsed || parsed.sucesso === false) {
    throw new Error(parsed?.mensagem || "Não foi possível calcular o destino.");
  }
  return parsed;
}
