import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Eye, GitBranch, LayoutTemplate, Loader2, Lock, Pencil, Plus, RefreshCw, Square, Target, Trash2, X } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";
import { listarEmpresas } from "../configuracao/lmsConfig.service";
import { EditarMetaDialog, type ModoEdicao } from "./EditarMetaDialog";
import { EquipesSection } from "./EquipesSection";
import { NovaMetaGuiadaDialog } from "./NovaMetaGuiadaDialog";
import { FaixaMetaBadge, ResultadosMetaDialog } from "./ResultadosMetaDialog";
import {
  ROTULO_PERIODICIDADE, ROTULO_STATUS, acaoMeta, copiarMetas, descreverAtividade, descreverQuem, estaMedindo, formatarValorMeta,
  infoMetrica, listarMetas, obterCatalogoMetas, salvarMeta, type AcaoMeta, type CatalogoMetas, type Meta, type MetaEntrada,
  type ModeloMeta, type StatusMeta,
} from "./metas.service";

type Filtro = "ATIVAS" | "PENDENTES" | "RASCUNHOS" | "ENCERRADAS" | "TODAS";
const FILTROS: Array<{ id: Filtro; rotulo: string; status: StatusMeta[] | null }> = [
  { id: "ATIVAS", rotulo: "Ativas", status: ["ATIVA"] },
  { id: "PENDENTES", rotulo: "Aguardando aprovação", status: ["EM_APROVACAO"] },
  { id: "RASCUNHOS", rotulo: "Rascunhos e rejeitadas", status: ["RASCUNHO", "REJEITADA"] },
  { id: "ENCERRADAS", rotulo: "Encerradas", status: ["ENCERRADA"] },
  { id: "TODAS", rotulo: "Todas", status: null },
];

type Pergunta = { meta: Meta; acao: "REJEITAR" | "ENCERRAR" | "EXCLUIR" } | null;

export function LmsMetasPage() {
  const { tenantId, empresaId: empresaSessao } = useTenant();
  const [empresas, setEmpresas] = useState<Array<{ id: string; nome: string }>>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(empresaSessao);
  const [catalogo, setCatalogo] = useState<CatalogoMetas | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("ATIVAS");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<{ modo: ModoEdicao; meta: Meta | null } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [resultados, setResultados] = useState<Meta | null>(null);
  const [pergunta, setPergunta] = useState<Pergunta>(null);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [copiando, setCopiando] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);
  /** Fase 10.28: assistente guiado (nova meta ou rascunho criado por ele). */
  const [guiada, setGuiada] = useState<{ meta: Meta | null } | null>(null);

  useEffect(() => { if (!empresaId && empresaSessao) setEmpresaId(empresaSessao); }, [empresaSessao, empresaId]);
  useEffect(() => { if (tenantId) listarEmpresas(tenantId).then(setEmpresas); }, [tenantId]);

  const carregar = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setCarregando(true);
    setErro(null);
    try {
      const [cat, lista] = await Promise.all([obterCatalogoMetas(tenantId, empresaId), listarMetas(tenantId, empresaId, null)]);
      setCatalogo(cat);
      setMetas(lista);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as metas.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(() => {
    const st = FILTROS.find((f) => f.id === filtro)?.status;
    return st ? metas.filter((m) => st.includes(m.status)) : metas;
  }, [metas, filtro]);
  const contagem = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.id, f.status ? metas.filter((m) => f.status!.includes(m.status)).length : metas.length])), [metas]);

  async function salvar(dados: MetaEntrada) {
    if (!tenantId) return;
    setSalvando(true);
    try {
      const r = await salvarMeta(tenantId, dados);
      toast.success(r.mensagem);
      setEdicao(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
    } finally {
      setSalvando(false);
    }
  }

  async function executar(meta: Meta, acao: AcaoMeta, motivo?: string, data?: string) {
    if (!tenantId) return;
    try {
      const r = await acaoMeta(tenantId, meta.id, acao, motivo, data);
      toast.success(r.mensagem);
      setPergunta(null);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  }

  async function copiar(desde: string, ate: string | null) {
    if (!tenantId) return;
    try {
      const r = await copiarMetas(tenantId, selecionadas, desde, ate);
      toast.success(r.mensagem);
      setCopiando(false);
      setSelecionadas([]);
      setFiltro("RASCUNHOS");
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível copiar.");
    }
  }

  async function aplicarModelo(modelo: ModeloMeta, armazemIds: string[], desde: string, ativar: boolean) {
    if (!tenantId || !empresaId || !catalogo) return;
    try {
      let total = 0;
      for (const m of modelo.metas) {
        const r = await salvarMeta(tenantId, {
          empresa_id: empresaId, armazem_ids: armazemIds, metrica: m.metrica, atividade: "TODAS", periodicidade: m.periodicidade,
          alvo: m.alvo, minimo: m.minimo, excelencia: m.excelencia, vigente_desde: desde, origem: "MODELO", ativar,
          nome: `${infoMetrica(catalogo, m.metrica)?.rotulo ?? m.metrica} · ${modelo.nome}`,
        });
        total += r.quantidade;
      }
      toast.success(`${total} meta(s) criada(s) a partir do modelo "${modelo.nome}".`);
      setModeloAberto(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível aplicar o modelo.");
    }
  }

  const podeCriar = !!catalogo?.pode_criar;

  return (
    <div className="space-y-5" data-testid="lms-metas">
      <section className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-muted-foreground">Empresa</span>
            <select className="h-9 min-w-[220px] rounded-md border border-border bg-background px-2 text-sm" value={empresaId ?? ""}
              onChange={(e) => { setEmpresaId(e.target.value || null); setSelecionadas([]); }}>
              {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw size={14} className={cn("mr-1", carregando && "animate-spin")} /> Atualizar
          </Button>
        </div>
        {podeCriar && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setModeloAberto(true)}><LayoutTemplate size={14} className="mr-1" /> Usar modelo</Button>
            <Button size="sm" onClick={() => setGuiada({ meta: null })}><Plus size={14} className="mr-1" /> Nova meta</Button>
          </div>
        )}
        {catalogo && !podeCriar && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock size={13} /> Somente leitura.</p>
        )}
        {catalogo?.exige_aprovacao && (
          <p className="w-full text-xs text-muted-foreground">Nesta empresa, metas criadas pelo supervisor só valem depois da aprovação do gerente.</p>
        )}
      </section>

      {erro && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{erro}</p>}

      {catalogo && (
        <section className="rounded-lg border border-border bg-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Situação das metas">
              {FILTROS.map((f) => (
                <button key={f.id} type="button" role="tab" aria-selected={filtro === f.id} onClick={() => setFiltro(f.id)}
                  className={cn("rounded-full border px-3 py-1 text-xs", filtro === f.id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
                  {f.rotulo} <span className="tabular-nums">({contagem[f.id] ?? 0})</span>
                </button>
              ))}
            </div>
            {podeCriar && selecionadas.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => setCopiando(true)}>
                <Copy size={14} className="mr-1" /> Copiar {selecionadas.length} para outro período
              </Button>
            )}
          </header>

          {carregando && metas.length === 0 ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Target size={22} /> Nenhuma meta nesta situação.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    {podeCriar && <th className="w-8 px-3 py-2" />}
                    <th className="px-3 py-2 text-left font-medium">Meta</th>
                    <th className="px-3 py-2 text-left font-medium">Para quem</th>
                    <th className="px-3 py-2 text-right font-medium">Alvo</th>
                    <th className="px-3 py-2 text-left font-medium">Vigência</th>
                    <th className="px-3 py-2 text-left font-medium">Último resultado</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((m) => {
                    const info = infoMetrica(catalogo, m.metrica);
                    const st = ROTULO_STATUS[m.status];
                    return (
                      <tr key={m.id} className="border-b border-border align-top last:border-0">
                        {podeCriar && (
                          <td className="px-3 py-2">
                            <Checkbox aria-label={`Selecionar ${m.nome}`} checked={selecionadas.includes(m.id)}
                              onCheckedChange={() => setSelecionadas(selecionadas.includes(m.id) ? selecionadas.filter((x) => x !== m.id) : [...selecionadas, m.id])} />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{m.nome}</p>
                          <p className="text-xs text-muted-foreground">
                            {info?.rotulo} · {descreverAtividade(m)} · {ROTULO_PERIODICIDADE[m.periodicidade]}
                            {m.rampa.length > 0 && " · com rampa"}
                          </p>
                          <span className={cn("mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium", st.classe)}>{st.texto}</span>
                          {m.motivo_status && <p className="mt-1 text-[11px] text-muted-foreground">{m.motivo_status}</p>}
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">{descreverQuem(m)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {estaMedindo(m) ? (
                            <span className="block text-xs font-medium text-foreground">Medindo até {formatDate(m.medir_ate!)}</span>
                          ) : (
                            <span className="font-semibold">{formatarValorMeta(m.alvo, info?.unidade)}</span>
                          )}
                          {m.linha_base != null && (
                            <span className="block text-[11px] text-muted-foreground">partiu de {formatarValorMeta(m.linha_base, info?.unidade)}</span>
                          )}
                          {(m.minimo != null || m.excelencia != null) && (
                            <span className="block text-[11px] text-muted-foreground">
                              mín. {formatarValorMeta(m.minimo, info?.unidade)} · exc. {formatarValorMeta(m.excelencia, info?.unidade)}
                            </span>
                          )}
                          {m.peso != null && Number(m.peso) !== 1 && (
                            <span className="block text-[11px] text-muted-foreground">peso {Number(m.peso).toLocaleString("pt-BR")}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {m.vigente_ate && m.vigente_ate < m.vigente_desde
                            ? "Não chegou a valer"
                            : <>{formatDate(m.vigente_desde)}{m.vigente_ate ? ` a ${formatDate(m.vigente_ate)}` : " em diante"}</>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {m.ultimo ? (
                            <div className="space-y-1">
                              <span className="tabular-nums text-foreground">{formatarValorMeta(m.ultimo.realizado, info?.unidade)}</span>
                              {m.ultimo.atingimento_pct != null && <span className="ml-1 text-muted-foreground">({m.ultimo.atingimento_pct}%)</span>}
                              <div><FaixaMetaBadge faixa={m.ultimo.faixa} /></div>
                              <span className="text-[11px] text-muted-foreground">{formatDate(m.ultimo.periodo_ini)}{m.ultimo.parcial ? " · em andamento" : ""}</span>
                            </div>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            {(m.status === "ATIVA" || m.status === "ENCERRADA") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setResultados(m)} aria-label={`Resultados de ${m.nome}`}>
                                <Eye size={14} />
                              </Button>
                            )}
                            {catalogo.pode_editar && (m.status === "RASCUNHO" || m.status === "REJEITADA") && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Editar ${m.nome}`}
                                  onClick={() => (m.objetivo ? setGuiada({ meta: m }) : setEdicao({ modo: "EDITAR", meta: m }))}><Pencil size={14} /></Button>
                                {estaMedindo(m) ? (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setGuiada({ meta: m })}>Definir alvo</Button>
                                ) : (
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => executar(m, "ATIVAR")}>
                                    {catalogo.exige_aprovacao && !catalogo.pode_aprovar ? "Enviar" : "Ativar"}
                                  </Button>
                                )}
                              </>
                            )}
                            {catalogo.pode_excluir && (m.status === "RASCUNHO" || m.status === "REJEITADA") && (
                              <Button size="sm" variant="ghost" className="h-7 px-2" aria-label={`Excluir ${m.nome}`} onClick={() => setPergunta({ meta: m, acao: "EXCLUIR" })}><Trash2 size={14} /></Button>
                            )}
                            {catalogo.pode_aprovar && m.status === "EM_APROVACAO" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => executar(m, "APROVAR")}><Check size={13} className="mr-1" />Aprovar</Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setPergunta({ meta: m, acao: "REJEITAR" })}><X size={13} className="mr-1" />Rejeitar</Button>
                              </>
                            )}
                            {catalogo.pode_editar && m.status === "ATIVA" && (
                              <>
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Nova versão" aria-label={`Nova versão de ${m.nome}`} onClick={() => setEdicao({ modo: "NOVA_VERSAO", meta: m })}><GitBranch size={14} /></Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" title="Encerrar" aria-label={`Encerrar ${m.nome}`} onClick={() => setPergunta({ meta: m, acao: "ENCERRAR" })}><Square size={13} /></Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {catalogo && tenantId && empresaId && <EquipesSection tenantId={tenantId} empresaId={empresaId} catalogo={catalogo} onAlterou={carregar} />}

      {catalogo && tenantId && empresaId && (
        <EditarMetaDialog
          aberto={!!edicao}
          modo={edicao?.modo ?? "NOVA"}
          inicial={edicao?.meta ?? null}
          catalogo={catalogo}
          tenantId={tenantId}
          empresaId={empresaId}
          salvando={salvando}
          onCancelar={() => setEdicao(null)}
          onSalvar={salvar}
        />
      )}

      {catalogo && tenantId && empresaId && (
        <NovaMetaGuiadaDialog
          aberto={!!guiada}
          inicial={guiada?.meta ?? null}
          catalogo={catalogo}
          tenantId={tenantId}
          empresaId={empresaId}
          onCancelar={() => setGuiada(null)}
          onSalvo={async (r) => {
            toast.success(r.mensagem);
            setGuiada(null);
            setFiltro(r.status === "ATIVA" ? "ATIVAS" : r.status === "EM_APROVACAO" ? "PENDENTES" : "RASCUNHOS");
            await carregar();
          }}
          onModoAvancado={() => { const m = guiada?.meta ?? null; setGuiada(null); setEdicao(m ? { modo: "EDITAR", meta: m } : { modo: "NOVA", meta: null }); }}
        />
      )}

      {tenantId && (
        <ResultadosMetaDialog meta={resultados} unidade={resultados ? infoMetrica(catalogo, resultados.metrica)?.unidade : undefined}
          tenantId={tenantId} onFechar={() => setResultados(null)} />
      )}

      {pergunta && <PerguntaDialog pergunta={pergunta} hoje={catalogo?.hoje ?? ""} onCancelar={() => setPergunta(null)}
        onConfirmar={(motivo, data) => executar(pergunta.meta, pergunta.acao, motivo, data)} />}

      {copiando && <CopiarDialog quantidade={selecionadas.length} hoje={catalogo?.hoje ?? ""} onCancelar={() => setCopiando(false)} onConfirmar={copiar} />}

      {modeloAberto && catalogo && <ModeloDialog catalogo={catalogo} onCancelar={() => setModeloAberto(false)} onAplicar={aplicarModelo} />}
    </div>
  );
}

function PerguntaDialog({ pergunta, hoje, onCancelar, onConfirmar }: {
  pergunta: NonNullable<Pergunta>; hoje: string; onCancelar: () => void; onConfirmar: (motivo?: string, data?: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hoje);
  const t = { REJEITAR: "Rejeitar meta", ENCERRAR: "Encerrar meta", EXCLUIR: "Excluir rascunho" }[pergunta.acao];
  const bloqueado = pergunta.acao === "REJEITAR" && !motivo.trim();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t}</DialogTitle>
          <DialogDescription>{pergunta.meta.nome}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {pergunta.acao === "ENCERRAR" && (
            <div className="space-y-1.5">
              <Label htmlFor="enc-data">Deixa de valer a partir de</Label>
              <Input id="enc-data" type="date" value={data} min={pergunta.meta.vigente_desde} onChange={(e) => setData(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Encerrar hoje tira a meta já de hoje, no coletor e no score. Os resultados dos dias anteriores ficam no histórico.
                {data <= pergunta.meta.vigente_desde && " Como a meta ainda não tinha começado a valer, ela fica sem resultados."}
              </p>
            </div>
          )}
          {pergunta.acao === "EXCLUIR" ? (
            <p className="text-muted-foreground">O rascunho será apagado. Metas que já valeram não são apagadas: são encerradas.</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="perg-motivo">Motivo {pergunta.acao === "REJEITAR" ? "(obrigatório)" : "(opcional)"}</Label>
              <Textarea id="perg-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button variant={pergunta.acao === "EXCLUIR" ? "destructive" : "default"} disabled={bloqueado}
            onClick={() => onConfirmar(motivo.trim() || undefined, pergunta.acao === "ENCERRAR" ? data : undefined)}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopiarDialog({ quantidade, hoje, onCancelar, onConfirmar }: {
  quantidade: number; hoje: string; onCancelar: () => void; onConfirmar: (desde: string, ate: string | null) => void;
}) {
  const proximoMes = useMemo(() => {
    const [a, m] = (hoje || "2026-01-01").split("-").map(Number);
    return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  }, [hoje]);
  const [desde, setDesde] = useState(proximoMes);
  const [ate, setAte] = useState("");
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiar {quantidade} meta(s)</DialogTitle>
          <DialogDescription>As cópias entram como rascunho, com o mesmo alvo, escopo e rampa. Ative depois de revisar.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="space-y-1.5"><Label htmlFor="cp-desde">Vale a partir de</Label><Input id="cp-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="cp-ate">Até (opcional)</Label><Input id="cp-ate" type="date" value={ate} min={desde} onChange={(e) => setAte(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button onClick={() => onConfirmar(desde, ate || null)} disabled={!desde}>Copiar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeloDialog({ catalogo, onCancelar, onAplicar }: {
  catalogo: CatalogoMetas; onCancelar: () => void; onAplicar: (m: ModeloMeta, armazens: string[], desde: string, ativar: boolean) => void;
}) {
  const [codigo, setCodigo] = useState(catalogo.modelos[0]?.codigo ?? "");
  const [armazens, setArmazens] = useState<string[]>([]);
  const [desde, setDesde] = useState(catalogo.hoje);
  const [aplicando, setAplicando] = useState(false);
  const modelo = catalogo.modelos.find((m) => m.codigo === codigo);
  const exige = catalogo.exige_aprovacao && !catalogo.pode_aprovar;
  async function aplicar(ativar: boolean) {
    if (!modelo) return;
    setAplicando(true);
    try { await onAplicar(modelo, armazens, desde, ativar); } finally { setAplicando(false); }
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !aplicando) onCancelar(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Usar modelo de metas</DialogTitle>
          <DialogDescription>Cria um conjunto pronto de metas. Dá para ajustar cada uma depois.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-2">
            {catalogo.modelos.map((m) => (
              <label key={m.codigo} className={cn("flex cursor-pointer items-start gap-2 rounded-md border p-2", codigo === m.codigo ? "border-primary bg-primary/5" : "border-border")}>
                <input type="radio" name="modelo" className="mt-1" checked={codigo === m.codigo} onChange={() => setCodigo(m.codigo)} />
                <span><b className="text-foreground">{m.nome}</b><span className="block text-xs text-muted-foreground">{m.descricao}</span></span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Onde</Label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setArmazens([])}
                className={cn("rounded-full border px-3 py-1 text-xs", armazens.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border")}>Toda a empresa</button>
              {catalogo.armazens.map((a) => (
                <button key={a.id} type="button" onClick={() => setArmazens(armazens.includes(a.id) ? armazens.filter((x) => x !== a.id) : [...armazens, a.id])}
                  className={cn("rounded-full border px-3 py-1 text-xs", armazens.includes(a.id) ? "border-primary bg-primary/10 text-primary" : "border-border")}>{a.nome}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="mod-desde">Vale a partir de</Label><Input id="mod-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={aplicando}>Cancelar</Button>
          <Button variant="outline" onClick={() => aplicar(false)} disabled={aplicando || !modelo}>Criar como rascunho</Button>
          <Button onClick={() => aplicar(true)} disabled={aplicando || !modelo}>
            {aplicando && <Loader2 size={14} className="mr-1 animate-spin" />}{exige ? "Criar e enviar para aprovação" : "Criar e ativar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
