/**
 * Fluxo de Expedição · N3.1 — ordem de percurso das ruas dentro do grupo de separação.
 * Mesma regra do antigo Roteiro de Separação (tabela ordem_expedicao); cada alteração
 * grava na hora, separada do botão "Salvar fluxo".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckSquare, GripVertical, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseError } from "@/lib/errorMapper";

interface OrdemItem { id?: string; rua: number | null; armazem_id?: string | null; ordem: string; sequencia: number }

interface Props { tenantId: string; empresaId: string; podeEditar: boolean; versao?: number }

// ordem_expedicao / armazem / fn_endereco_valores_filtro: acesso direto como no Roteiro antigo (tabelas com RLS por tenant).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function OrdemPercursoPanel({ tenantId, empresaId, podeEditar, versao }: Props) {
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [armazemId, setArmazemId] = useState("");
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);
  const [ruas, setRuas] = useState<number[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [lote, setLote] = useState<"marcar" | "desmarcar" | null>(null);
  const loteRef = useRef(false);
  const [confirmarDesmarcar, setConfirmarDesmarcar] = useState(false);
  const [arrastando, setArrastando] = useState<number | null>(null);

  useEffect(() => {
    if (!tenantId || !empresaId) return;
    void db.from("armazem").select("id, descricao").eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }: { data: { id: string; descricao: string }[] | null }) => {
        const lista = data ?? [];
        setArmazens(lista);
        setArmazemId((atual) => (atual && lista.some((a) => a.id === atual) ? atual : lista.length === 1 ? lista[0].id : ""));
      });
  }, [tenantId, empresaId, versao]);

  const carregar = useCallback(async () => {
    if (!tenantId || !empresaId || !armazemId) { setOrdens([]); setRuas([]); return; }
    setCarregando(true);
    const [o, r] = await Promise.all([
      db.from("ordem_expedicao").select("*").eq("tenant_id", tenantId).eq("empresa_id", empresaId)
        .or(`armazem_id.eq.${armazemId},armazem_id.is.null`).order("sequencia", { ascending: true }),
      db.rpc("fn_endereco_valores_filtro", { p_tenant_id: tenantId, p_armazem_id: armazemId, p_zona_atividade_id: null }),
    ]);
    if (r.error) toast.error(parseError(r.error, "roteiro-ruas").title);
    setOrdens(o.error ? [] : (o.data ?? []));
    setRuas(r.error ? [] : ((r.data?.rua ?? []) as unknown[]).map(Number));
    setCarregando(false);
  }, [tenantId, empresaId, armazemId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const marcadas = useMemo(
    () => [...ordens].filter((o) => ruas.includes(Number(o.rua))).sort((a, b) => a.sequencia - b.sequencia),
    [ordens, ruas],
  );
  const desmarcadas = useMemo(() => ruas.filter((r) => !ordens.some((o) => Number(o.rua) === r)), [ordens, ruas]);

  const renumerar = async (lista: OrdemItem[]) => {
    await Promise.all(lista.map((item, i) => db.from("ordem_expedicao").update({ sequencia: i + 1 }).eq("id", item.id)));
  };

  const adicionar = async (rua: number) => {
    const seq = Math.max(0, ...ordens.map((o) => Number(o.sequencia) || 0)) + 1;
    const { error } = await db.from("ordem_expedicao").insert({ tenant_id: tenantId, empresa_id: empresaId, armazem_id: armazemId, rua, ordem: "ASC", sequencia: seq });
    if (error) { toast.error(parseError(error, "roteiro-separacao-page").title); return; }
    void carregar();
  };

  const remover = async (id: string) => {
    await db.from("ordem_expedicao").delete().eq("id", id);
    await renumerar(marcadas.filter((o) => o.id !== id));
    void carregar();
  };

  const mudarSentido = async (id: string | undefined, ordem: string) => {
    await db.from("ordem_expedicao").update({ ordem }).eq("id", id);
    void carregar();
  };

  const soltar = async (destino: number) => {
    if (arrastando === null || arrastando === destino) return;
    const nova = [...marcadas];
    const [item] = nova.splice(arrastando, 1);
    nova.splice(destino, 0, item);
    setArrastando(null);
    setOrdens(nova.map((o, i) => ({ ...o, sequencia: i + 1 })));
    await renumerar(nova);
  };

  const marcarTodas = async () => {
    if (loteRef.current || desmarcadas.length === 0) return;
    loteRef.current = true; setLote("marcar");
    try {
      const prox = Math.max(0, ...ordens.map((o) => Number(o.sequencia) || 0)) + 1;
      const { error } = await db.from("ordem_expedicao").insert(desmarcadas.map((rua, i) => ({
        tenant_id: tenantId, empresa_id: empresaId, armazem_id: armazemId, rua, ordem: "ASC", sequencia: prox + i,
      })));
      if (error) { toast.error(parseError(error, "roteiro-marcar-todos").title); return; }
      await carregar();
    } finally { loteRef.current = false; setLote(null); }
  };

  const desmarcarTodas = async () => {
    setConfirmarDesmarcar(false);
    const ids = marcadas.filter((o) => o.id && o.armazem_id === armazemId).map((o) => o.id as string);
    if (loteRef.current || ids.length === 0) return;
    loteRef.current = true; setLote("desmarcar");
    try {
      const { error } = await db.from("ordem_expedicao").delete().eq("tenant_id", tenantId).eq("armazem_id", armazemId).in("id", ids);
      if (error) { toast.error(parseError(error, "roteiro-desmarcar-todos").title); return; }
      if (ids.length < marcadas.length) toast.info("Algumas ruas são de configuração geral (sem armazém) e não foram removidas.");
      await carregar();
    } finally { loteRef.current = false; setLote(null); }
  };

  const bloqueado = !podeEditar || !!lote;

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="percurso-armazem" className="text-[11px] font-medium text-muted-foreground uppercase">Armazém</label>
          <select id="percurso-armazem" value={armazemId} onChange={(e) => setArmazemId(e.target.value)}
            className="h-9 w-56 px-3 rounded-lg border border-border bg-background text-sm text-foreground outline-none focus:border-primary">
            <option value="">Selecione o armazém...</option>
            {armazens.map((a) => <option key={a.id} value={a.id}>{a.descricao}</option>)}
          </select>
        </div>
        {armazemId && ruas.length > 0 && (
          <>
            <span className="text-xs text-muted-foreground pb-2">{marcadas.length} de {ruas.length} ruas no percurso</span>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bloqueado || desmarcadas.length === 0} onClick={() => void marcarTodas()}>
                {lote === "marcar" ? <Loader2 size={13} className="animate-spin" /> : <CheckSquare size={13} />} Marcar todas
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={bloqueado || marcadas.length === 0} onClick={() => setConfirmarDesmarcar(true)}>
                {lote === "desmarcar" ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />} Desmarcar todas
              </Button>
            </div>
          </>
        )}
      </div>

      {!armazemId ? (
        <p className="text-xs text-muted-foreground py-3">Selecione um armazém para definir a ordem das ruas.</p>
      ) : carregando ? (
        <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      ) : ruas.length === 0 ? (
        <p className="text-xs text-muted-foreground py-3">Nenhuma rua cadastrada neste armazém.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-72 overflow-y-auto pr-1">
          {marcadas.map((item, idx) => (
            <div key={`m-${item.id}`} draggable={!bloqueado} onDragStart={() => setArrastando(idx)}
              onDragOver={(e) => e.preventDefault()} onDrop={() => void soltar(idx)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20 cursor-grab active:cursor-grabbing">
              <GripVertical size={13} className="text-muted-foreground/50 shrink-0" aria-hidden="true" />
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
              <Checkbox checked disabled={bloqueado} aria-label={`Tirar a rua ${item.rua} do percurso`}
                onCheckedChange={(v) => { if (!v && item.id) void remover(item.id); }} />
              <span className="text-sm text-foreground flex-1">Rua {item.rua}</span>
              <select value={item.ordem || "ASC"} disabled={bloqueado} aria-label={`Sentido da rua ${item.rua}`}
                onChange={(e) => void mudarSentido(item.id, e.target.value)}
                className="h-7 px-1.5 rounded border border-border bg-secondary/40 text-xs text-foreground outline-none">
                <option value="ASC">Crescente ↑</option>
                <option value="DESC">Decrescente ↓</option>
              </select>
            </div>
          ))}
          {desmarcadas.map((r) => (
            <div key={`d-${r}`} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-transparent hover:bg-secondary/30">
              <span className="w-[13px] shrink-0" /><span className="w-5 shrink-0" />
              <Checkbox checked={false} disabled={bloqueado} aria-label={`Incluir a rua ${r} no percurso`}
                onCheckedChange={(v) => { if (v) void adicionar(r); }} />
              <span className="text-sm text-muted-foreground flex-1">Rua {r}</span>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={confirmarDesmarcar} onOpenChange={setConfirmarDesmarcar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desmarcar todas as ruas?</AlertDialogTitle>
            <AlertDialogDescription>
              Remover as {marcadas.length} ruas do percurso deste armazém? A ordem configurada será perdida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void desmarcarTodas()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
