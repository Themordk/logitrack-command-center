import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Loader2, ArrowDownToLine } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

const TIPO_TAREFA_ABAST = "172beee9-65ac-44dc-95a2-36b67b4aebbe";

interface TarefaAbast {
  id: string;
  produto_desc: string;
  produto_sku: string;
  quantidade_requerida: number;
  status: string;
  criado_em: string;
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
        .select("id, quantidade_requerida, status, criado_em, produto:produto_id(sku, descricao), origem:id_local_origem(descricao), destino:id_local_destino(descricao)")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("tipo_tarefa_id", TIPO_TAREFA_ABAST)
        .in("status", ["CRIADA", "EM_ANDAMENTO"])
        .order("criado_em", { ascending: false });

      setTarefas((data || []).map((t: any) => ({
        id: t.id,
        produto_desc: t.produto?.descricao || "—",
        produto_sku: t.produto?.sku || "—",
        quantidade_requerida: t.quantidade_requerida,
        status: t.status,
        criado_em: t.criado_em,
      })));
      setLoading(false);
    })();
  }, [tenantId, empresaId]);

  const statusColor: Record<string, string> = {
    CRIADA: "bg-red-500/20 text-red-300",
    EM_ANDAMENTO: "bg-yellow-500/20 text-yellow-300",
  };

  return (
    <ColetorLayout title="Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>
      ) : tarefas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ArrowDownToLine size={40} className="text-[hsl(213,31%,45%)]" />
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa de abastecimento pendente.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[hsl(213,31%,55%)]">{tarefas.length} tarefa(s) pendente(s)</p>
          {tarefas.map((t) => (
            <div key={t.id} className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{t.produto_sku}</p>
                  <p className="text-sm text-white truncate">{t.produto_desc}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[t.status] || "bg-gray-500/20 text-gray-300"}`}>
                  {t.status}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2 pt-2 border-t border-[hsl(222,35%,18%)]">
                <span className="text-xs text-[hsl(213,31%,55%)]">Qtd: <span className="text-white font-bold">{t.quantidade_requerida}</span></span>
                <span className="text-[10px] text-[hsl(213,31%,45%)]">{new Date(t.criado_em).toLocaleDateString("pt-BR")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColetorLayout>
  );
}
