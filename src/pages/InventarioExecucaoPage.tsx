import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onNavigate: (path: string) => void;
  inventarioId: string;
  numeroInventario: number;
  tarefaId: string;
  sku: string;
}

interface Execucao {
  id: string;
  usuario_login: string | null;
  quantidade_executada: number | null;
  endereco_descricao: string | null;
  lote: string | null;
  fabricacao: string | null;
  validade: string | null;
  hu: string | null;
  concluido_em: string | null;
}

export function InventarioExecucaoPage({ onNavigate, inventarioId, numeroInventario, tarefaId, sku }: Props) {
  const [execucoes, setExecucoes] = useState<Execucao[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  const fetchExecucoes = useCallback(async () => {
    if (!tarefaId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await (supabase as any)
        .from("tarefa_execucao")
        .select("id, usuario_id, quantidade_executada, endereco_origem_id, lote, fabricacao, validade, hu, concluido_em", { count: "exact" })
        .eq("tarefa_id", tarefaId)
        .order("concluido_em", { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Enrich with usuario login and endereco descricao
      const enriched = await Promise.all(
        (data || []).map(async (ex: any) => {
          let usuario_login = "—";
          if (ex.usuario_id) {
            const { data: usr } = await (supabase as any)
              .from("usuario")
              .select("login")
              .eq("id", ex.usuario_id)
              .single();
            if (usr) usuario_login = usr.login;
          }

          let endereco_descricao = "—";
          if (ex.endereco_origem_id) {
            const { data: end } = await (supabase as any)
              .from("endereco")
              .select("descricao")
              .eq("id", ex.endereco_origem_id)
              .single();
            if (end) endereco_descricao = end.descricao;
          }

          let hu_codigo = "—";
          if (ex.hu) {
            const { data: huData } = await (supabase as any)
              .from("hu")
              .select("codigo_hu")
              .eq("id", ex.hu)
              .single();
            if (huData) hu_codigo = huData.codigo_hu || ex.hu;
          }

          return {
            id: ex.id,
            usuario_login,
            quantidade_executada: ex.quantidade_executada,
            endereco_descricao,
            lote: ex.lote,
            fabricacao: ex.fabricacao,
            validade: ex.validade,
            hu: hu_codigo,
            concluido_em: ex.concluido_em,
          };
        })
      );

      setExecucoes(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tarefaId, page]);

  useEffect(() => { fetchExecucoes(); }, [fetchExecucoes]);

  const totalPages = Math.ceil(total / pageSize);
  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleString("pt-BR"); } catch { return "—"; }
  };

  const backPath = `/atividades/inventario/${inventarioId}/itens?numero=${numeroInventario}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3">
        <button onClick={() => onNavigate(backPath)} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-bold text-foreground">Execuções da Contagem</h1>
          <p className="text-xs text-muted-foreground">Inventário #{numeroInventario} · SKU: {sku}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">SKU</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Usuário</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Qtd Executada</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Endereço</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Lote</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Fabricação</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Validade</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">HU</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {execucoes.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhuma execução encontrada.</td></tr>
                  ) : execucoes.map((ex, idx) => (
                    <tr key={ex.id} className={cn("border-b border-border/50 hover:bg-secondary/30 transition-colors", idx % 2 !== 0 && "bg-secondary/10")}>
                      <td className="px-3 py-2 text-sm font-mono font-semibold text-primary">{sku}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.usuario_login}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground text-right">{ex.quantidade_executada ?? "—"}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.endereco_descricao}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.lote || "—"}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.fabricacao || "—"}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.validade || "—"}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{ex.hu}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">{fmtDate(ex.concluido_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded text-xs transition-colors", page === p ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
