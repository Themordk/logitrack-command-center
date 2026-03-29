import { useState, useEffect } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function ConferenciaItensPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<any[]>([]);
  const numeroOnda = sessionStorage.getItem("coletor_conferencia_numero_onda") || "";

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_conferencia_tarefas");
    if (raw) {
      setTarefas(JSON.parse(raw));
    }
  }, []);

  const getStatusColor = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s === "CONCLUIDA" || s === "FINALIZADA") return "text-green-400 bg-green-500/10 border-green-500/30";
    if (s === "ATRIBUIDA" || s === "EM_EXECUCAO") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    if (s === "PENDENTE" || s === "CRIADA") return "text-red-400 bg-red-500/10 border-red-500/30";
    return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  };

  return (
    <ColetorLayout title={`Itens - Onda #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/conferencia/produto">
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
        {tarefas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum item encontrado.</p>
          </div>
        ) : (
          tarefas.map((t, idx) => (
            <div
              key={t.tarefa_id || idx}
              className="flex items-center gap-3 p-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] shrink-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white font-mono">{t.sku || "—"}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusColor(t.status)}`}>
                    {t.status || "PENDENTE"}
                  </span>
                </div>
                <p className="text-xs text-[hsl(213,31%,65%)] truncate mt-0.5">{t.produto || t.descricao || "—"}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </ColetorLayout>
  );
}