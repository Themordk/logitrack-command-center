import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  ROTULO_ESCOPO, ROTULO_PERIODICIDADE, formatarValorMeta, infoMetrica, quantidadeLote, sugerirMeta, validarMeta,
  type Atividade, type CatalogoMetas, type DegrauRampa, type EscopoItem, type Meta, type MetaEntrada, type Metrica,
  type Periodicidade, type SugestaoMeta, type TipoEscopo,
} from "./metas.service";

export type ModoEdicao = "NOVA" | "EDITAR" | "NOVA_VERSAO";

interface Props {
  aberto: boolean;
  modo: ModoEdicao;
  inicial: Meta | null;
  catalogo: CatalogoMetas;
  tenantId: string;
  empresaId: string;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: (dados: MetaEntrada) => void;
}

const sel = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const RAMPA_PADRAO: DegrauRampa[] = [{ ate_semana: 1, pct: 70 }, { ate_semana: 3, pct: 85 }];

function maisUmDia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function EditarMetaDialog({ aberto, modo, inicial, catalogo, tenantId, empresaId, salvando, onCancelar, onSalvar }: Props) {
  const [nome, setNome] = useState("");
  const [metrica, setMetrica] = useState<Metrica>("PERFORMANCE");
  const [atividade, setAtividade] = useState<Atividade>("TODAS");
  const [tipos, setTipos] = useState<string[]>([]);
  const [categoria, setCategoria] = useState("");
  const [armazens, setArmazens] = useState<string[]>([]);
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("DIARIO");
  const [alvo, setAlvo] = useState("");
  const [minimo, setMinimo] = useState("");
  const [excelencia, setExcelencia] = useState("");
  const [peso, setPeso] = useState("1");
  const [desde, setDesde] = useState(catalogo.hoje);
  const [ate, setAte] = useState("");
  const [escopo, setEscopo] = useState<EscopoItem[]>([]);
  const [novoTipoEscopo, setNovoTipoEscopo] = useState<TipoEscopo>("USUARIO");
  const [novoRef, setNovoRef] = useState("");
  const [usarRampa, setUsarRampa] = useState(false);
  const [rampa, setRampa] = useState<DegrauRampa[]>(RAMPA_PADRAO);
  const [observacao, setObservacao] = useState("");
  const [sugestao, setSugestao] = useState<SugestaoMeta | null>(null);
  const [sugerindo, setSugerindo] = useState(false);
  const [origemAssistente, setOrigemAssistente] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const m = inicial;
    setNome(modo === "NOVA_VERSAO" && m ? `${m.nome}` : m?.nome ?? "");
    setMetrica(m?.metrica ?? "PERFORMANCE");
    setAtividade(m?.atividade ?? "TODAS");
    setTipos(m?.tipo_tarefa_id ? [m.tipo_tarefa_id] : []);
    setCategoria(m?.categoria ?? "");
    setArmazens(m?.armazem_id ? [m.armazem_id] : []);
    setPeriodicidade(m?.periodicidade ?? "DIARIO");
    setAlvo(m ? String(m.alvo) : "");
    setMinimo(m?.minimo != null ? String(m.minimo) : "");
    setExcelencia(m?.excelencia != null ? String(m.excelencia) : "");
    setPeso(m?.peso != null ? String(m.peso).replace(".", ",") : "1");
    setDesde(modo === "NOVA_VERSAO" && m ? (maisUmDia(catalogo.hoje) > m.vigente_desde ? maisUmDia(catalogo.hoje) : maisUmDia(m.vigente_desde)) : m?.vigente_desde ?? catalogo.hoje);
    setAte(m?.vigente_ate && modo !== "NOVA_VERSAO" ? m.vigente_ate : "");
    setEscopo(m?.escopo ?? []);
    setUsarRampa(Boolean(m?.rampa.length));
    setRampa(m?.rampa.length ? m.rampa : RAMPA_PADRAO);
    setObservacao(m?.observacao ?? "");
    setSugestao(null);
    setOrigemAssistente(false);
  }, [aberto, inicial, modo, catalogo.hoje]);

  const info = infoMetrica(catalogo, metrica);
  const lote = modo === "NOVA";

  const opcoesEscopo = useMemo<Record<TipoEscopo, Array<{ id: string; nome: string }>>>(() => ({
    USUARIO: catalogo.operadores, EQUIPE: catalogo.equipes, TURNO: catalogo.turnos, PERFIL: catalogo.perfis,
  }), [catalogo]);

  const entrada: MetaEntrada = {
    id: modo === "EDITAR" ? inicial?.id ?? null : null,
    empresa_id: empresaId,
    armazem_ids: lote ? armazens : undefined,
    armazem_id: lote ? undefined : armazens[0] ?? null,
    nome: nome.trim() || undefined,
    metrica,
    atividade,
    tipo_tarefa_ids: lote && atividade === "TIPO" ? tipos : undefined,
    tipo_tarefa_id: !lote && atividade === "TIPO" ? tipos[0] ?? null : undefined,
    categoria: atividade === "CATEGORIA" ? categoria || null : null,
    periodicidade,
    alvo: num(alvo) ?? NaN,
    minimo: num(minimo),
    excelencia: num(excelencia),
    peso: num(peso) ?? NaN,
    vigente_desde: desde,
    vigente_ate: ate || null,
    escopo,
    rampa: usarRampa ? rampa : [],
    rampa_base: "PRIMEIRA_EXECUCAO",
    observacao: observacao.trim() || null,
    origem: origemAssistente ? "ASSISTENTE" : "MANUAL",
    versao_anterior_id: modo === "NOVA_VERSAO" ? inicial?.id ?? null : null,
  };
  const erro = validarMeta(entrada, info) ?? (modo === "NOVA_VERSAO" && inicial && desde <= inicial.vigente_desde
    ? "A nova versão precisa começar depois do início da atual." : null);
  const qtd = lote ? quantidadeLote(entrada) : 1;
  const exigeAprovacao = catalogo.exige_aprovacao && !catalogo.pode_aprovar;

  function adicionarEscopo() {
    if (!novoRef || escopo.some((e) => e.tipo === novoTipoEscopo && e.ref_id === novoRef)) return;
    const nomeRef = opcoesEscopo[novoTipoEscopo].find((o) => o.id === novoRef)?.nome ?? null;
    setEscopo([...escopo, { tipo: novoTipoEscopo, ref_id: novoRef, nome: nomeRef }]);
    setNovoRef("");
  }

  async function sugerir() {
    setSugerindo(true);
    try {
      setSugestao(await sugerirMeta(tenantId, { ...entrada, armazem_id: armazens[0] ?? null, tipo_tarefa_id: tipos[0] ?? null }));
    } catch (e) {
      setSugestao({ sucesso: true, suficiente: false, mensagem: e instanceof Error ? e.message : "Não foi possível sugerir.", participantes: 0, com_dado: 0 });
    } finally {
      setSugerindo(false);
    }
  }

  function usarSugestao() {
    if (!sugestao?.sugestao) return;
    setAlvo(String(sugestao.sugestao.alvo));
    setMinimo(String(sugestao.sugestao.minimo));
    setExcelencia(String(sugestao.sugestao.excelencia));
    setOrigemAssistente(true);
  }

  if (!aberto) return null;
  const titulo = modo === "EDITAR" ? "Editar meta" : modo === "NOVA_VERSAO" ? "Nova versão da meta" : "Nova meta";
  const toggle = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>
            {modo === "NOVA_VERSAO"
              ? "A meta atual continua valendo até a véspera do início desta versão; o histórico dela é preservado."
              : "A meta diz qual resultado a operação quer atingir no período. O tempo padrão continua sendo a régua de cada tarefa."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          {/* O quê */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">O que medir</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="meta-metrica">Métrica</Label>
                <select id="meta-metrica" className={sel} value={metrica}
                  onChange={(e) => { setMetrica(e.target.value as Metrica); setSugestao(null); }}>
                  {catalogo.metricas.map((m) => <option key={m.codigo} value={m.codigo}>{m.rotulo}</option>)}
                </select>
                {info && <p className="text-xs text-muted-foreground">{info.ajuda}{info.trava_origem ? " Só vale com início real registrado no coletor." : ""}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-atividade">Tarefas</Label>
                <select id="meta-atividade" className={sel} value={atividade}
                  onChange={(e) => setAtividade(e.target.value as Atividade)}>
                  <option value="TODAS">Todas as tarefas</option>
                  <option value="TIPO" disabled={!info?.permite_atividade}>Um tipo de tarefa{lote ? " (ou vários, uma meta para cada)" : ""}</option>
                  <option value="CATEGORIA" disabled={!info?.permite_atividade}>Uma categoria</option>
                </select>
              </div>
            </div>
            {atividade === "TIPO" && (
              lote ? (
                <div className="max-h-36 overflow-y-auto rounded-md border border-border p-2 grid grid-cols-2 gap-1" aria-label="Tipos de tarefa">
                  {catalogo.tipos_tarefa.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-xs">
                      <Checkbox checked={tipos.includes(t.id)} onCheckedChange={() => setTipos(toggle(tipos, t.id))} />
                      <span className="font-mono">{t.codigo}</span> <span className="truncate text-muted-foreground">{t.descricao}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <select aria-label="Tipo de tarefa" className={sel} value={tipos[0] ?? ""} onChange={(e) => setTipos(e.target.value ? [e.target.value] : [])}>
                  <option value="">Escolha…</option>
                  {catalogo.tipos_tarefa.map((t) => <option key={t.id} value={t.id}>{t.codigo} · {t.descricao}</option>)}
                </select>
              )
            )}
            {atividade === "CATEGORIA" && (
              <select aria-label="Categoria" className={sel} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Escolha…</option>
                {catalogo.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </section>

          {/* Quem */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Para quem</h3>
            {lote ? (
              <div className="space-y-1.5">
                <Label>Onde</Label>
                <div className="flex flex-wrap gap-2" aria-label="Armazéns">
                  <button type="button" onClick={() => setArmazens([])}
                    className={cn("rounded-full border px-3 py-1 text-xs", armazens.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                    Toda a empresa
                  </button>
                  {catalogo.armazens.map((a) => (
                    <button key={a.id} type="button" onClick={() => setArmazens(toggle(armazens, a.id))}
                      className={cn("rounded-full border px-3 py-1 text-xs", armazens.includes(a.id) ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                      {a.nome}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="meta-armazem">Onde</Label>
                <select id="meta-armazem" className={sel} value={armazens[0] ?? ""} onChange={(e) => setArmazens(e.target.value ? [e.target.value] : [])}>
                  <option value="">Toda a empresa</option>
                  {catalogo.armazens.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Só para (opcional)</Label>
              <div className="flex gap-2">
                <select aria-label="Tipo de escopo" className={cn(sel, "w-36")} value={novoTipoEscopo}
                  onChange={(e) => { setNovoTipoEscopo(e.target.value as TipoEscopo); setNovoRef(""); }}>
                  {(Object.keys(ROTULO_ESCOPO) as TipoEscopo[]).map((t) => <option key={t} value={t}>{ROTULO_ESCOPO[t]}</option>)}
                </select>
                <select aria-label="Item do escopo" className={sel} value={novoRef} onChange={(e) => setNovoRef(e.target.value)}>
                  <option value="">Escolha…</option>
                  {opcoesEscopo[novoTipoEscopo].map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={adicionarEscopo} disabled={!novoRef}>
                  <Plus size={14} />
                </Button>
              </div>
              {escopo.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {escopo.map((e) => (
                    <span key={`${e.tipo}-${e.ref_id}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs">
                      {ROTULO_ESCOPO[e.tipo]}: {e.nome ?? e.ref_id.slice(0, 8)}
                      <button type="button" aria-label="Remover" onClick={() => setEscopo(escopo.filter((x) => x !== e))}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sem restrição: vale para todos os operadores do lugar escolhido.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Se um operador cair em mais de uma meta da mesma métrica, vale a mais específica: operador, equipe, turno, perfil, armazém, empresa.
              </p>
            </div>
          </section>

          {/* Quando e quanto */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Período e alvo</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="meta-periodicidade">Apurar</Label>
                <select id="meta-periodicidade" className={sel} value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
                  {(Object.keys(ROTULO_PERIODICIDADE) as Periodicidade[]).map((p) => <option key={p} value={p}>{ROTULO_PERIODICIDADE[p]}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-desde">Vale a partir de</Label>
                <Input id="meta-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-ate">Até {periodicidade === "PERSONALIZADO" ? "(obrigatório)" : "(opcional)"}</Label>
                <Input id="meta-ate" type="date" value={ate} min={desde} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="meta-minimo">Mínimo aceitável</Label>
                <Input id="meta-minimo" inputMode="decimal" value={minimo} onChange={(e) => { setMinimo(e.target.value); setOrigemAssistente(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-alvo">Alvo</Label>
                <Input id="meta-alvo" inputMode="decimal" value={alvo} onChange={(e) => { setAlvo(e.target.value); setOrigemAssistente(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meta-excelencia">Excelência</Label>
                <Input id="meta-excelencia" inputMode="decimal" value={excelencia} onChange={(e) => { setExcelencia(e.target.value); setOrigemAssistente(false); }} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="meta-peso">Peso no score</Label>
                <Input id="meta-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
              </div>
              <p className="sm:col-span-2 self-end text-xs text-muted-foreground">
                O score do operador é a média do atingimento das metas dele, ponderada por este peso (de 0,1 a 10).
                Use peso maior para a meta que mais importa.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              {info?.direcao === "MENOR" ? "Nesta métrica menor é melhor." : "Faixas do resultado: abaixo do mínimo, aceitável, na meta e excelente."}
              {info ? ` Valores em ${info.unidade === "PCT" ? "%" : info.unidade === "POR_HORA" ? "por hora" : "quantidade no período"}.` : ""}
            </p>

            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2" data-testid="meta-assistente">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-foreground"><b>Assistente</b>: sugere o alvo pela mediana das últimas 4 semanas + 5% e mostra quantos já atingiriam.</p>
                <Button type="button" size="sm" variant="outline" onClick={sugerir} disabled={sugerindo}>
                  {sugerindo ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Sparkles size={14} className="mr-1" />} Sugerir alvo
                </Button>
              </div>
              {sugestao && !sugestao.suficiente && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400" role="status">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {sugestao.mensagem}
                </p>
              )}
              {sugestao?.sugestao && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">{sugestao.mensagem}</span>
                  <Button type="button" size="sm" onClick={usarSugestao}>
                    Usar {formatarValorMeta(sugestao.sugestao.alvo, info?.unidade)}
                  </Button>
                </div>
              )}
            </div>

            {info?.direcao !== "MENOR" && (
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <Checkbox checked={usarRampa} onCheckedChange={(c) => setUsarRampa(c === true)} />
                  <span>Rampa para novatos (meta menor nas primeiras semanas)</span>
                </label>
                {usarRampa && (
                  <div className="space-y-1.5 rounded-md border border-border p-3" aria-label="Rampa">
                    {rampa.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span>Até a semana</span>
                        <Input aria-label={`Semana do degrau ${i + 1}`} className="h-8 w-16" inputMode="numeric" value={String(r.ate_semana)}
                          onChange={(e) => setRampa(rampa.map((x, k) => (k === i ? { ...x, ate_semana: Number(e.target.value) || 0 } : x)))} />
                        <span>:</span>
                        <Input aria-label={`Percentual do degrau ${i + 1}`} className="h-8 w-16" inputMode="numeric" value={String(r.pct)}
                          onChange={(e) => setRampa(rampa.map((x, k) => (k === i ? { ...x, pct: Number(e.target.value) || 0 } : x)))} />
                        <span>% do alvo</span>
                        <button type="button" aria-label="Remover degrau" onClick={() => setRampa(rampa.filter((_, k) => k !== i))}><X size={12} /></button>
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <Button type="button" size="sm" variant="ghost" disabled={rampa.length >= 6}
                        onClick={() => setRampa([...rampa, { ate_semana: (rampa.at(-1)?.ate_semana ?? 0) + 1, pct: Math.min(100, (rampa.at(-1)?.pct ?? 60) + 10) }])}>
                        <Plus size={13} className="mr-1" /> Degrau
                      </Button>
                      <span className="text-[11px] text-muted-foreground">Depois do último degrau, 100%. Contado da primeira execução do operador.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meta-nome">Nome (opcional)</Label>
              <Input id="meta-nome" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)}
                placeholder={lote && qtd > 1 ? "Gerado para cada meta do lote" : info?.rotulo} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meta-obs">Observação</Label>
              <Textarea id="meta-obs" rows={1} value={observacao} maxLength={300} onChange={(e) => setObservacao(e.target.value)} />
            </div>
          </section>

          {lote && qtd > 1 && <p className="text-xs text-foreground">Este cadastro cria <b>{qtd} metas</b> (uma por tipo de tarefa e armazém).</p>}
          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button variant="outline" onClick={() => onSalvar({ ...entrada, ativar: false })} disabled={!!erro || salvando}>Salvar rascunho</Button>
          <Button onClick={() => onSalvar({ ...entrada, ativar: true })} disabled={!!erro || salvando}>
            {salvando && <Loader2 size={14} className="mr-1 animate-spin" />}
            {exigeAprovacao ? "Enviar para aprovação" : modo === "NOVA_VERSAO" ? "Ativar nova versão" : "Salvar e ativar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
