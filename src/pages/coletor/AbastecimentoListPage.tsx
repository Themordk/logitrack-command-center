import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Loader2, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

const TIPO_TAREFA_ABAST = "172beee9-65ac-44dc-95a2-36b67b4aebbe";

interface TarefaAbast {
  id: string;
  produto_id: string;
  produto_desc: string;
  produto_sku: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  status: string;
  criado_em: string;
  endereco_origem_id: string;
  endereco_origem: string;
  endereco_destino_id: string;
  endereco_destino: string;
  endereco_destino_rua: number;
}

export function AbastecimentoListPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaAbast[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) return;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("tarefa")
        .select("id, produto_id, quantidade_requerida, quantidade_executada, status, criado_em, id_local_origem, id_local_destino, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao, rua)")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("tipo_tarefa_id", TIPO_TAREFA_ABAST)
        .in("status", ["CRIADA", "ATRIBUIDA", "EM_ANDAMENTO"])
        .order("criado_em", { ascending: false });

      setTarefas((data || []).map((t: any) => ({
        id: t.id,
        produto_id: t.produto_id,
        produto_desc: t.produto?.descricao || "—",
        produto_sku: t.produto?.sku || "—",
        quantidade_requerida: Number(t.quantidade_requerida),
        quantidade_executada: Number(t.quantidade_executada || 0),
        status: t.status,
        criado_em: t.criado_em,
        endereco_origem_id: t.id_local_origem,
        endereco_origem: t.origem?.descricao || "—",
        endereco_destino_id: t.id_local_destino,
        endereco_destino: t.destino?.descricao || "—",
        endereco_destino_rua: t.destino?.rua || 0,
      })));
      setLoading(false);
    })();
  }, [tenantId, empresaId]);

  const statusColor: Record<string, string> = {
    CRIADA: "bg-red-500/20 text-red-300",
    ATRIBUIDA: "bg-blue-500/20 text-blue-300",
    EM_ANDAMENTO: "bg-yellow-500/20 text-yellow-300",
  };

  const handleSelectTarefa = (tarefa: TarefaAbast) => {
    // Group all tarefas by the same abastecimento batch (same creation time roughly)
    // For now, navigate with just this single tarefa - can be extended later
    const tarefasInfo = tarefas
      .filter(t => t.status !== "CONCLUIDA" && t.status !== "CANCELADA")
      .map(t => ({
        id: t.id,
        produto_id: t.produto_id,
        produto_sku: t.produto_sku,
        produto_desc: t.produto_desc,
        endereco_origem_id: t.endereco_origem_id,
        endereco_origem_desc: t.endereco_origem,
        endereco_destino_id: t.endereco_destino_id,
        endereco_destino_desc: t.endereco_destino,
        endereco_destino_rua: t.endereco_destino_rua,
        quantidade_requerida: t.quantidade_requerida,
        quantidade_executada: t.quantidade_executada,
      }));

    sessionStorage.setItem("abast_tarefas", JSON.stringify(tarefasInfo));
    sessionStorage.removeItem("abast_coletas");
    onNavigate("/coletor/movimentos/abastecimento/coleta");
  };

  return (
    <ColetorLayout title="Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
      ) : tarefas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ArrowDownToLine size={40} className="text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma tarefa de abastecimento pendente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{tarefas.length} tarefa(s) pendente(s)</p>
          {tarefas.map((t) => (
            <div
              key={t.id}
              className="bg-card border border-border rounded-xl p-3 cursor-pointer active:scale-[0.98] transition-transform"
              onClick={() => handleSelectTarefa(t)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-primary">{t.produto_sku}</p>
                  <p className="text-sm text-foreground truncate">{t.produto_desc}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[t.status] || "bg-muted text-muted-foreground"}`}>
                  {t.status}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">Qtd: <span className="text-foreground font-bold">{t.quantidade_requerida}</span></span>
                <span className="text-[10px] text-muted-foreground">{new Date(t.criado_em).toLocaleDateString("pt-BR")}</span>
              </div>
              <div className="flex gap-4 mt-1.5 text-[10px] text-muted-foreground">
                <span>Origem: <span className="text-foreground/70">{t.endereco_origem}</span></span>
                <span>Destino: <span className="text-foreground/70">{t.endereco_destino}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColetorLayout>
  );
}
