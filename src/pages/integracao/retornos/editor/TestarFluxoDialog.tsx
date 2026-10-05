import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseError } from "@/lib/errorMapper";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { retornosKeys } from "../retornosKeys";
import { documentosRecentes, executar, invokeDispatcher, obterExecucao } from "../retornosService";
import type { Catalogo, Combinador, DocumentoRecente, ExecucaoDetalhe, Regra } from "../retornos.types";
import { ehStatusFinal } from "./execucaoVisual";
import { descreverRegra } from "./campos/regras";

interface Props {
  aberto: boolean;
  onFechar: () => void;
  fluxoId: string;
  tenantId: string;
  empresaId: string;
  evento: string | null;
  filtros: Regra[];
  combinador: Combinador;
  catalogo?: Catalogo;
  amostra: DocumentoRecente | null;
  temPublicada: boolean;
  podeEnviar: boolean;
  /** Grava o rascunho pendente antes de rodar. */
  antesDeExecutar: () => Promise<boolean>;
  onResultado: (d: ExecucaoDetalhe) => void;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TestarFluxoDialog(p: Props) {
  const [doc, setDoc] = useState<DocumentoRecente | null>(p.amostra);
  const [listaAberta, setListaAberta] = useState(false);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [versao, setVersao] = useState<"rascunho" | "publicada">("rascunho");
  const [modo, setModo] = useState<"simulacao" | "teste">("simulacao");
  const [confirmado, setConfirmado] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [barrado, setBarrado] = useState<string | null>(null);
  const cancelado = useRef(false);

  useEffect(() => {
    if (p.aberto) {
      setDoc(p.amostra); setBarrado(null); setConfirmado(false); setModo("simulacao"); setVersao("rascunho"); setTexto(""); setBusca("");
    }
  }, [p.aberto, p.amostra]);

  const hash = JSON.stringify([p.filtros, p.combinador]);
  const docsQ = useQuery({
    queryKey: retornosKeys.docsRecentes(p.tenantId, p.empresaId, p.evento ?? "", hash, busca),
    queryFn: () => documentosRecentes({
      tenantId: p.tenantId, empresaId: p.empresaId, evento: p.evento as string,
      filtros: p.filtros, combinador: p.combinador, limite: 20, busca: busca || null,
    }),
    enabled: p.aberto && !!p.evento,
  });
  const docs = useMemo(() => {
    const q = texto.trim().toLowerCase();
    const base = docsQ.data ?? [];
    return q ? base.filter((d) => d.numero.toLowerCase().includes(q) || (d.codigo_erp ?? "").toLowerCase().includes(q)) : base;
  }, [docsQ.data, texto]);

  // Atualiza o indicador de filtro do documento escolhido com a lista filtrada.
  const docInfo = doc ? (docsQ.data ?? []).find((d) => d.documento_id === doc.documento_id) ?? doc : null;

  const rodar = async () => {
    if (!doc) return;
    setExecutando(true); setBarrado(null); cancelado.current = false;
    try {
      if (versao === "rascunho" && !(await p.antesDeExecutar())) return;
      const r = await executar(p.fluxoId, doc.documento_id, modo, versao === "rascunho");
      if (r.status === "filtrado") {
        const campoBarrado = docInfo?.barrado_por;
        const regraBarrada = campoBarrado ? p.filtros.find((regra) => regra.campo === campoBarrado) : undefined;
        let motivo = regraBarrada
          ? `Barrado pela regra: ${descreverRegra(regraBarrada, p.catalogo)}`
          : campoBarrado ? `Barrado pela regra: ${campoBarrado}` : null;
        if (!campoBarrado) {
          try { const d = await obterExecucao(r.execucao_id); motivo = d.erro; } catch { /* sem detalhe */ }
        }
        setBarrado(motivo ?? "");
        return;
      }
      const disp = await invokeDispatcher({ acao: "executar", execucao_id: r.execucao_id });
      let det: ExecucaoDetalhe | null = disp.executado ? disp.detalhe ?? await obterExecucao(r.execucao_id) : null;
      const limite = Date.now() + 30_000;
      while (!det || !ehStatusFinal(det.status)) {
        if (cancelado.current) { toast.info("Espera cancelada. Acompanhe o resultado na aba Execuções."); return; }
        if (Date.now() > limite) { toast.info("A execução ainda não terminou. Acompanhe na aba Execuções."); return; }
        await esperar(2000);
        if (cancelado.current) continue;
        det = await obterExecucao(r.execucao_id);
      }
      p.onResultado(det);
    } catch (e) {
      const pe = parseError(e, "Testar fluxo");
      toast.error(pe.title, { description: pe.instruction || undefined });
    } finally {
      setExecutando(false);
    }
  };

  const podeRodar = !!doc && !executando && (modo === "simulacao" || (p.podeEnviar && confirmado));

  return (
    <Dialog open={p.aberto} onOpenChange={(v) => { if (!v && !executando) p.onFechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Testar fluxo</DialogTitle>
          <DialogDescription>Rode o fluxo com um documento real e veja o caminho no canvas.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Documento</Label>
            {!p.evento ? (
              <p className="text-xs text-muted-foreground">Escolha o evento do gatilho antes de testar.</p>
            ) : (
              <Popover open={listaAberta} onOpenChange={setListaAberta}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={listaAberta} aria-label="Documento do teste" className="h-10 w-full justify-between rounded-lg bg-secondary/40">
                    <span className="flex min-w-0 items-center gap-2 truncate font-mono text-xs">
                      {docInfo ? <>{docInfo.numero} <span className="text-muted-foreground">{docInfo.tipo ?? ""}</span><SeloFiltro d={docInfo} /></> : "Escolha um documento"}
                    </span>
                    <ChevronsUpDown size={13} className="opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-2">
                  <div className="relative mb-1">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input autoFocus aria-label="Buscar documento" placeholder="Número ou código ERP (Enter busca exato)" value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setBusca(texto.trim()); } }}
                      className="h-8 pl-7 text-xs bg-secondary/40" />
                  </div>
                  {docsQ.isFetching && <p className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Carregando…</p>}
                  <ul className="max-h-64 overflow-y-auto">
                    {docs.map((d) => (
                      <li key={`${d.documento_id}-${d.movimento_id ?? ""}`}>
                        <button type="button" onClick={() => { setDoc(d); setBarrado(null); setListaAberta(false); }}
                          className={cn("flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", doc?.documento_id === d.documento_id && "bg-secondary/60")}>
                          <span className="min-w-0 truncate"><span className="font-mono">{d.numero}</span> <span className="text-muted-foreground">{d.tipo ?? ""}</span></span>
                          <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                            <SeloFiltro d={d} />
                            {formatDateTime(d.quando)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!docsQ.isFetching && !docs.length && <li className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum documento. Pressione Enter para buscar o número exato.</li>}
                  </ul>
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="testar-versao" className="text-xs uppercase tracking-wide text-muted-foreground">Versão</Label>
            <Select value={versao} onValueChange={(v) => setVersao(v as "rascunho" | "publicada")}>
              <SelectTrigger id="testar-versao" className="h-10 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho atual</SelectItem>
                <SelectItem value="publicada" disabled={!p.temPublicada}>Versão publicada{!p.temPublicada ? " (nunca publicado)" : ""}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Modo</span>
            <RadioGroup value={modo} onValueChange={(v) => setModo(v as "simulacao" | "teste")} className="gap-2">
              <label htmlFor="modo-sim" className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 hover:bg-secondary/30">
                <RadioGroupItem id="modo-sim" value="simulacao" className="mt-0.5" />
                <span><span className="block text-sm font-medium text-foreground">Simular</span>
                  <span className="text-xs text-muted-foreground">Monta tudo e mostra o que seria enviado. Nada sai do WMS.</span></span>
              </label>
              <label htmlFor="modo-teste" className={cn("flex items-start gap-2 rounded-lg border border-border p-2.5", p.podeEnviar ? "cursor-pointer hover:bg-secondary/30" : "opacity-60")}>
                <RadioGroupItem id="modo-teste" value="teste" disabled={!p.podeEnviar} className="mt-0.5" />
                <span><span className="block text-sm font-medium text-foreground">Enviar teste</span>
                  <span className="text-xs text-muted-foreground">
                    Envia DE VERDADE ao ERP, marcado como teste. Não altera o documento nem cria notificações.
                    {!p.podeEnviar && " Você não tem permissão para enviar."}
                  </span></span>
              </label>
            </RadioGroup>
            {modo === "teste" && (
              <label className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-400">
                <Checkbox checked={confirmado} onCheckedChange={(v) => setConfirmado(v === true)} aria-label="Confirmar envio real" />
                Entendo que o ERP vai receber esta requisição
              </label>
            )}
          </div>

          {barrado !== null && (
            <div className="rounded-lg border border-zinc-500/30 bg-zinc-500/10 px-3 py-2 text-xs text-foreground">
              <p className="font-medium">O documento não passa nos filtros do gatilho</p>
              {barrado && <p className="mt-0.5 text-muted-foreground">{barrado}</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          {executando ? (
            <>
              <span className="mr-auto flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite"><Loader2 size={13} className="animate-spin" /> Executando…</span>
              <Button variant="ghost" onClick={() => { cancelado.current = true; }}>Cancelar espera</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={p.onFechar}>Fechar</Button>
          )}
          <Button onClick={() => void rodar()} disabled={!podeRodar}>
            {executando && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {modo === "simulacao" ? "Simular" : "Enviar teste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SeloFiltro({ d }: { d: DocumentoRecente }) {
  if (d.passa_filtro == null) return null;
  return d.passa_filtro
    ? <span className="inline-flex items-center gap-0.5 text-emerald-400"><Check size={12} aria-hidden />Passa</span>
    : <span className="inline-flex items-center gap-0.5 text-rose-400" title={d.barrado_por ?? undefined}><X size={12} aria-hidden />Barrado</span>;
}
