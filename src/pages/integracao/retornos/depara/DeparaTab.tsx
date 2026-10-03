import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeftRight, ArrowRight, Info, Loader2, Lock, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { retornosKeys } from "../retornosKeys";
import { listarFluxos, listarMapa, salvarMapa } from "../retornosService";
import { usePermissaoRetorno } from "../useRetornos";

const EMPRESA = "__empresa__";
const NOVO = "__novo__";
const RE_DOMINIO = /^[a-z][a-z0-9_]*$/;

interface Linha { chave: string; valor_wms: string; valor_erp: string }

let seq = 0;
const novaChave = () => `l${++seq}`;

type Pendente = { tipo: "escopo" | "dominio"; valor: string } | null;

interface DeparaTabProps {
  params?: URLSearchParams;
  onNavigate?: (path: string) => void;
}

export function DeparaTab({ params, onNavigate }: DeparaTabProps) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const { podeEditar } = usePermissaoRetorno();
  const qc = useQueryClient();

  const [escopo, setEscopo] = useState<string>(() => params?.get("fluxo") || EMPRESA);
  const [dominio, setDominio] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novosDominios, setNovosDominios] = useState<string[]>([]);
  const [dialogNovo, setDialogNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [pendente, setPendente] = useState<Pendente>(null);

  const fluxoId = escopo === EMPRESA ? null : escopo;

  const fluxosQ = useQuery({
    queryKey: [...retornosKeys.fluxos(tenantId, empresaId, false), empresaVersion],
    queryFn: () => listarFluxos(tenantId as string, empresaId as string, false),
    enabled: !!tenantId && !!empresaId,
  });

  // Valida o fluxo vindo da URL assim que a lista de fluxos carregar.
  const [fluxoUrlValidado, setFluxoUrlValidado] = useState(false);
  useEffect(() => {
    if (fluxoUrlValidado || !fluxosQ.isSuccess) return;
    setFluxoUrlValidado(true);
    if (escopo !== EMPRESA && !(fluxosQ.data ?? []).some((f) => f.id === escopo)) {
      setEscopo(EMPRESA);
      toast.info("Fluxo não encontrado; mostrando o de-para da empresa.");
      onNavigate?.("/config/integracao/retornos?aba=depara");
    }
  }, [fluxoUrlValidado, fluxosQ.isSuccess, fluxosQ.data, escopo, onNavigate]);

  const mapaQ = useQuery({
    queryKey: [...retornosKeys.mapa(tenantId, empresaId, fluxoId), empresaVersion],
    queryFn: () => listarMapa(tenantId as string, empresaId as string, fluxoId),
    enabled: !!tenantId && !!empresaId,
  });

  const itens = useMemo(() => mapaQ.data ?? [], [mapaQ.data]);

  const dominios = useMemo(() => {
    const s = new Set<string>(itens.map((i) => i.dominio));
    novosDominios.forEach((d) => s.add(d));
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [itens, novosDominios]);

  // Seleciona o primeiro domínio disponível quando nada está escolhido.
  useEffect(() => {
    if (!mapaQ.isSuccess) return;
    if (dominio && dominios.includes(dominio)) return;
    setDominio(dominios[0] ?? null);
  }, [mapaQ.isSuccess, dominios, dominio]);

  const proprios = useMemo(
    () => itens.filter((i) => i.dominio === dominio && i.fluxo_id === fluxoId),
    [itens, dominio, fluxoId],
  );
  const herdados = useMemo(
    () => (fluxoId ? itens.filter((i) => i.dominio === dominio && i.fluxo_id === null) : []),
    [itens, dominio, fluxoId],
  );

  // Recarrega a grade a partir do servidor quando não há alterações locais.
  useEffect(() => {
    if (alterado) return;
    setLinhas(proprios.map((i) => ({ chave: novaChave(), valor_wms: i.valor_wms, valor_erp: i.valor_erp })));
  }, [proprios, alterado]);

  const duplicados = useMemo(() => {
    const cont = new Map<string, number>();
    linhas.forEach((l) => { const v = l.valor_wms.trim(); if (v) cont.set(v, (cont.get(v) ?? 0) + 1); });
    return new Set(Array.from(cont).filter(([, n]) => n > 1).map(([v]) => v));
  }, [linhas]);
  const linhaInvalida = (l: Linha) => !l.valor_wms.trim() || duplicados.has(l.valor_wms.trim());
  const temInvalida = linhas.some(linhaInvalida);

  function aplicarTroca(p: NonNullable<Pendente>) {
    setAlterado(false);
    if (p.tipo === "escopo") {
      setEscopo(p.valor); setDominio(null); setNovosDominios([]);
      const q = new URLSearchParams({ aba: "depara" });
      if (p.valor !== EMPRESA) q.set("fluxo", p.valor);
      onNavigate?.(`/config/integracao/retornos?${q.toString()}`);
    }
    else setDominio(p.valor);
  }

  function pedirTroca(p: NonNullable<Pendente>) {
    if (p.tipo === "dominio" && p.valor === NOVO) { setNomeNovo(""); setDialogNovo(true); return; }
    if (alterado) setPendente(p); else aplicarTroca(p);
  }

  function criarDominio() {
    const nome = nomeNovo.trim();
    if (!RE_DOMINIO.test(nome)) return;
    const aplicar = () => {
      if (!dominios.includes(nome)) setNovosDominios((d) => [...d, nome]);
      setDominio(nome);
      setAlterado(false);
      setDialogNovo(false);
    };
    if (alterado) { setDialogNovo(false); setPendente({ tipo: "dominio", valor: nome }); setNovosDominios((d) => d.includes(nome) ? d : [...d, nome]); }
    else aplicar();
  }

  function editar(chave: string, campo: "valor_wms" | "valor_erp", valor: string) {
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)));
    setAlterado(true);
  }

  async function salvar() {
    if (!dominio || temInvalida) return;
    setSalvando(true);
    try {
      await salvarMapa(
        tenantId as string, empresaId as string, fluxoId, dominio,
        linhas.map((l) => ({ valor_wms: l.valor_wms.trim(), valor_erp: l.valor_erp.trim() })),
      );
      await qc.invalidateQueries({ queryKey: ["retorno-mapa"] });
      await mapaQ.refetch();
      // Só agora libera a grade: o efeito reidrata com os dados novos.
      setAlterado(false);
      toast.success("De-para salvo.");
    } catch (e) {
      toast.error(parseError(e, "Salvar de-para").title);
    } finally {
      setSalvando(false);
    }
  }

  const nomeValido = RE_DOMINIO.test(nomeNovo.trim());

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        <Info size={13} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Use o de-para nos nós Montar payload: no mapeamento, escolha o domínio no campo; no JSONata, use{" "}
          <code className="font-mono text-foreground">$mapa("dominio", valor)</code>.
        </span>
      </div>

      <div className="card-surface p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5 min-w-[220px]">
          <Label htmlFor="depara-escopo" className="text-xs uppercase tracking-wide text-muted-foreground">Escopo</Label>
          <Select value={escopo} onValueChange={(v) => pedirTroca({ tipo: "escopo", valor: v })}>
            <SelectTrigger id="depara-escopo" className="h-10 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPRESA}>Toda a empresa</SelectItem>
              {(fluxosQ.data ?? []).filter((f) => !f.arquivado_em).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 min-w-[220px]">
          <Label htmlFor="depara-dominio" className="text-xs uppercase tracking-wide text-muted-foreground">Domínio</Label>
          <Select value={dominio ?? ""} onValueChange={(v) => pedirTroca({ tipo: "dominio", valor: v })}>
            <SelectTrigger id="depara-dominio" className="h-10 rounded-lg bg-secondary/40 font-mono text-xs">
              <SelectValue placeholder="Nenhum domínio" />
            </SelectTrigger>
            <SelectContent>
              {dominios.map((d) => <SelectItem key={d} value={d} className="font-mono text-xs">{d}</SelectItem>)}
              {podeEditar && <SelectItem value={NOVO}>Novo domínio…</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {mapaQ.isLoading ? (
        <div className="card-surface p-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : mapaQ.isError ? (
        <div className="card-surface border-destructive/40 px-4 py-3 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-destructive"><AlertTriangle size={13} /> Não foi possível carregar o de-para.</span>
          <Button size="sm" variant="outline" onClick={() => mapaQ.refetch()}>Tentar novamente</Button>
        </div>
      ) : !dominio ? (
        <div className="card-surface flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
            <ArrowLeftRight size={15} className="text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Nenhum de-para neste escopo. Crie um domínio para traduzir valores do WMS em códigos do ERP.
          </p>
          {podeEditar && (
            <Button size="sm" onClick={() => { setNomeNovo(""); setDialogNovo(true); }}>
              <Plus size={14} /> Novo domínio
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="card-surface overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                <span className="font-mono">{dominio}</span>
                <span className="text-muted-foreground font-normal"> · {fluxoId ? "deste fluxo" : "da empresa"}</span>
              </h3>
              {podeEditar && (
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => {
                  setLinhas((ls) => [...ls, { chave: novaChave(), valor_wms: "", valor_erp: "" }]);
                  setAlterado(true);
                }}>
                  <Plus size={14} /> Adicionar linha
                </Button>
              )}
            </div>
            <table className="w-full text-xs">
              <thead className="bg-secondary/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Valor no WMS</th>
                  <th className="px-3 py-2 w-8" aria-label="Traduz para" />
                  <th className="px-3 py-2 font-medium">Código no ERP</th>
                  <th className="px-3 py-2 w-12" aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr className="border-t border-border/40">
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhuma tradução neste domínio. {podeEditar && "Use “Adicionar linha” para criar."}
                    </td>
                  </tr>
                )}
                {linhas.map((l) => {
                  const inval = linhaInvalida(l);
                  const dup = duplicados.has(l.valor_wms.trim());
                  return (
                    <tr key={l.chave} className={`border-t border-border/40 ${inval ? "bg-rose-500/10" : "hover:bg-secondary/30"}`}>
                      <td className="px-3 py-2">
                        <Input
                          value={l.valor_wms}
                          onChange={(e) => editar(l.chave, "valor_wms", e.target.value)}
                          disabled={!podeEditar || salvando}
                          aria-label="Valor no WMS"
                          aria-invalid={inval}
                          className={`h-8 font-mono text-xs bg-secondary/40 ${inval ? "border-rose-500/60" : ""}`}
                        />
                        {inval && (
                          <p className="mt-1 text-[11px] text-rose-400">
                            {dup ? "Valor repetido neste domínio." : "Informe o valor no WMS."}
                          </p>
                        )}
                      </td>
                      <td className="px-1 py-2 text-center text-muted-foreground"><ArrowRight size={13} aria-hidden /></td>
                      <td className="px-3 py-2">
                        <Input
                          value={l.valor_erp}
                          onChange={(e) => editar(l.chave, "valor_erp", e.target.value)}
                          disabled={!podeEditar || salvando}
                          aria-label="Código no ERP"
                          className="h-8 font-mono text-xs bg-secondary/40"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="ghost" className="h-8 w-8" aria-label="Remover linha"
                              disabled={!podeEditar || salvando}
                              onClick={() => { setLinhas((ls) => ls.filter((x) => x.chave !== l.chave)); setAlterado(true); }}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remover linha</TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {fluxoId && herdados.length > 0 && (
            <div className="card-surface overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center gap-2">
                <Lock size={13} className="text-zinc-400" aria-hidden />
                <h3 className="text-sm font-semibold">Herdados da empresa</h3>
                <span className="text-xs text-muted-foreground">· somente leitura; os deste fluxo têm prioridade</span>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {herdados.map((h) => (
                    <tr key={h.id} className="border-t border-border/40 first:border-t-0 text-zinc-400">
                      <td className="px-3 py-2 font-mono">{h.valor_wms}</td>
                      <td className="px-1 py-2 w-8 text-center"><ArrowRight size={13} aria-hidden /></td>
                      <td className="px-3 py-2 font-mono">{h.valor_erp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {alterado && podeEditar && (
            <div className="card-surface px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 sticky bottom-0">
              <span className="text-xs text-amber-400 flex items-center gap-1.5">
                <AlertTriangle size={13} aria-hidden /> Alterações não salvas
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => setAlterado(false)}>
                  <Undo2 size={14} /> Descartar alterações
                </Button>
                <Button size="sm" disabled={salvando || temInvalida} onClick={salvar}>
                  {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {salvando ? "Salvando…" : "Salvar de-para"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogNovo} onOpenChange={setDialogNovo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo domínio</DialogTitle>
            <DialogDescription>Dê um nome em snake_case, ex.: status_pedido ou motivo_corte.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="novo-dominio" className="text-xs uppercase tracking-wide text-muted-foreground">Nome do domínio</Label>
            <Input
              id="novo-dominio" autoFocus value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") criarDominio(); }}
              placeholder="status_pedido"
              className="h-10 rounded-lg bg-secondary/40 font-mono"
            />
            {nomeNovo && !nomeValido && (
              <p className="text-[11px] text-rose-400">Use letras minúsculas, números e _ começando por letra.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNovo(false)}>Cancelar</Button>
            <Button disabled={!nomeValido} onClick={criarDominio}>Criar domínio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendente} onOpenChange={(o) => { if (!o) setPendente(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há alterações não salvas neste domínio. Ao continuar, elas serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendente) aplicarTroca(pendente); setPendente(null); }}>
              Descartar e trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
