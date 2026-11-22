/**
 * Fase 10.28 · Nova meta guiada por objetivo.
 * Quatro passos: o que melhorar → para quem → hoje × aonde chegar → revisar.
 * Linha de base, níveis (Manter/Evoluir/Desafiar), quantos atingem, realismo, avisos e
 * mínimo/excelência vêm só do banco (rpc_lms_meta_objetivos / _previa / _salvar_guiada);
 * a tela só mostra e envia. O fluxo antigo continua em "Modo avançado".
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, Loader2, Minus, Settings2, Smartphone, Sparkles, TrendingDown, TrendingUp, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";
import {
  ROTULO_ESCOPO, ROTULO_NIVEL, ROTULO_PERIODICIDADE, ROTULO_REALISMO, formatarValorMeta, frasePessoasAtingem, objetivosMeta, previaMeta,
  salvarMetaGuiada, type Atividade, type CatalogoMetas, type EscopoItem, type Meta, type MetaGuiadaEntrada, type NivelAmbicao,
  type ObjetivoCodigo, type ObjetivoMeta, type ObjetivosMeta, type Periodicidade, type PreviaMeta, type SalvarGuiadaResultado, type TipoEscopo,
  type UnidadeMetrica,
} from "./metas.service";

interface Props {
  aberto: boolean;
  /** Rascunho criado por este assistente (ex.: em "Medir primeiro") para completar; null = nova meta. */
  inicial: Meta | null;
  /** Fase 10.29: nova versão (próximo degrau) de uma meta ativa criada pelo assistente. */
  versaoDe?: Meta | null;
  catalogo: CatalogoMetas;
  tenantId: string;
  empresaId: string;
  onCancelar: () => void;
  onSalvo: (r: SalvarGuiadaResultado) => void;
  onModoAvancado: () => void;
}

type Passo = 1 | 2 | 3 | 4;
const PASSOS: Array<{ n: Passo; rotulo: string }> = [
  { n: 1, rotulo: "O que melhorar" }, { n: 2, rotulo: "Para quem" }, { n: 3, rotulo: "Hoje e alvo" }, { n: 4, rotulo: "Revisar" },
];
const sel = "h-9 w-full rounded-md border border-border bg-background px-2 text-sm";
const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
const ACOMPANHAR: Periodicidade[] = ["DIARIO", "SEMANAL", "MENSAL"];

function maisUmDia(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** "Aumentar o ritmo de 92,5% para 101,8%". */
export function fraseMeta(o: { verbo: string; menor_melhor: boolean }, unidade: UnidadeMetrica, base: number | null | undefined, alvo: number | null | undefined): string {
  if (alvo == null) return `Medir ${o.verbo} da equipe antes de definir o alvo`;
  const a = formatarValorMeta(alvo, unidade);
  if (base == null) return `${o.menor_melhor ? "Deixar" : "Levar"} ${o.verbo} da equipe ${o.menor_melhor ? "em até" : "a"} ${a}`;
  const b = formatarValorMeta(base, unidade);
  if (Math.abs(alvo - base) < 1e-9) return `Manter ${o.verbo} da equipe em ${a}`;
  const sobe = alvo > base;
  return `${sobe ? "Aumentar" : "Reduzir"} ${o.verbo} da equipe de ${b} para ${a}`;
}

export function NovaMetaGuiadaDialog({ aberto, inicial, versaoDe = null, catalogo, tenantId, empresaId, onCancelar, onSalvo, onModoAvancado }: Props) {
  const [passo, setPasso] = useState<Passo>(1);
  const [armazemId, setArmazemId] = useState<string | null>(null);
  const [objetivos, setObjetivos] = useState<ObjetivosMeta | null>(null);
  const [carregandoObj, setCarregandoObj] = useState(false);
  const [erroObj, setErroObj] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoCodigo | null>(null);
  const [atividade, setAtividade] = useState<Atividade>("TODAS");
  const [tipoId, setTipoId] = useState("");
  const [categoria, setCategoria] = useState("");
  const [escopo, setEscopo] = useState<EscopoItem[]>([]);
  const [tipoEscopo, setTipoEscopo] = useState<TipoEscopo>("EQUIPE");
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("DIARIO");
  const [previa, setPrevia] = useState<PreviaMeta | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [erroPrevia, setErroPrevia] = useState<string | null>(null);
  const [nivel, setNivel] = useState<NivelAmbicao | null>(null);
  const [alvoPers, setAlvoPers] = useState("");
  const [medir, setMedir] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [nome, setNome] = useState("");
  const [desde, setDesde] = useState(catalogo.hoje);
  const [ate, setAte] = useState("");
  const [peso, setPeso] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  // abrir: limpa ou carrega o rascunho guiado
  useEffect(() => {
    if (!aberto) return;
    const m = inicial ?? versaoDe;
    setPasso(m?.objetivo ? 3 : 1);
    setArmazemId(m ? m.armazem_id : catalogo.armazens.length === 1 ? catalogo.armazens[0].id : null);
    setObjetivo(m?.objetivo ?? null);
    setAtividade(m?.atividade ?? "TODAS");
    setTipoId(m?.tipo_tarefa_id ?? "");
    setCategoria(m?.categoria ?? "");
    setEscopo(m?.escopo ?? []);
    setPeriodicidade(m?.periodicidade && ACOMPANHAR.includes(m.periodicidade) ? m.periodicidade : "DIARIO");
    setPrevia(null);
    setNivel(null);
    setAlvoPers("");
    setMedir(false);
    setAvancado(false);
    setNome(m?.nome ?? "");
    setDesde(versaoDe ? [maisUmDia(catalogo.hoje), maisUmDia(versaoDe.vigente_desde)].sort()[1] : catalogo.hoje);
    setAte("");
    setPeso(m?.peso != null ? String(m.peso).replace(".", ",") : "1");
    setErroSalvar(null);
  }, [aberto, inicial, versaoDe, catalogo.hoje, catalogo.armazens]);

  // passo 1: objetivos com o número de hoje do lugar escolhido
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setCarregandoObj(true);
    setErroObj(null);
    objetivosMeta(tenantId, empresaId, armazemId)
      .then((r) => { if (vivo) setObjetivos(r); })
      .catch((e) => { if (vivo) { setObjetivos(null); setErroObj(e instanceof Error ? e.message : "Não foi possível carregar os objetivos."); } })
      .finally(() => { if (vivo) setCarregandoObj(false); });
    return () => { vivo = false; };
  }, [aberto, tenantId, empresaId, armazemId]);

  const obj = objetivos?.objetivos.find((o) => o.codigo === objetivo) ?? null;
  const tipos = useMemo(() => [...catalogo.tipos_tarefa].sort((a, b) => a.descricao.localeCompare(b.descricao, "pt-BR")), [catalogo.tipos_tarefa]);
  const opcoesEscopo = useMemo<Record<TipoEscopo, Array<{ id: string; nome: string }>>>(() => ({
    USUARIO: catalogo.operadores, EQUIPE: catalogo.equipes, TURNO: catalogo.turnos, PERFIL: catalogo.perfis,
  }), [catalogo]);
  const alvoPersNum = num(alvoPers);

  const dadosBase = useMemo<Omit<MetaGuiadaEntrada, "nivel" | "medir_primeiro" | "ativar">>(() => ({
    id: inicial?.id ?? null,
    versao_anterior_id: versaoDe?.id ?? null,
    empresa_id: empresaId,
    armazem_id: armazemId,
    objetivo: (objetivo ?? "RITMO") as ObjetivoCodigo,
    atividade,
    tipo_tarefa_id: atividade === "TIPO" ? tipoId || null : null,
    categoria: atividade === "CATEGORIA" ? categoria || null : null,
    periodicidade,
    escopo: escopo.map(({ tipo, ref_id }) => ({ tipo, ref_id })),
  }), [inicial?.id, versaoDe?.id, empresaId, armazemId, objetivo, atividade, tipoId, categoria, periodicidade, escopo]);

  // passos 3 e 4: prévia (espera 400 ms ao digitar outro valor)
  useEffect(() => {
    if (!aberto || passo < 3 || !objetivo) return;
    let vivo = true;
    const t = setTimeout(() => {
      setCarregandoPrevia(true);
      setErroPrevia(null);
      previaMeta(tenantId, { ...dadosBase, alvo: alvoPersNum })
        .then((r) => {
          if (!vivo) return;
          setPrevia(r);
          setNivel((n) => n ?? (r.linha_base.suficiente ? "EVOLUIR" : null));
          if (!versaoDe) setMedir((m) => m || (!r.linha_base.suficiente && alvoPersNum === null && !nivel));
        })
        .catch((e) => { if (vivo) setErroPrevia(e instanceof Error ? e.message : "Não foi possível calcular a prévia."); })
        .finally(() => { if (vivo) setCarregandoPrevia(false); });
    }, alvoPers ? 400 : 0);
    return () => { vivo = false; clearTimeout(t); };
    // nivel fica de fora de propósito: trocar o nível não muda a prévia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, passo, tenantId, dadosBase, alvoPersNum]);

  const base = previa?.linha_base;
  const unidade = previa?.unidade ?? obj?.unidade ?? "PCT";
  const nivelEscolhido = previa?.niveis.find((n) => n.codigo === nivel);
  const alvoFinal = medir ? null : nivel === "PERSONALIZADO" ? alvoPersNum : nivelEscolhido?.alvo ?? null;
  const avaliacaoFinal = nivel === "PERSONALIZADO" ? previa?.personalizado : nivelEscolhido;
  const exigeAprovacao = catalogo.exige_aprovacao && !catalogo.pode_aprovar;

  const bloqueio: string | null = (() => {
    if (passo === 1) {
      if (!objetivo) return "Escolha o que você quer melhorar.";
      if (atividade === "TIPO" && !tipoId) return "Escolha a tarefa.";
      if (atividade === "CATEGORIA" && !categoria) return "Escolha a categoria.";
    }
    if (passo >= 3) {
      if (!previa) return carregandoPrevia ? "Calculando…" : erroPrevia ?? "Calculando…";
      if (medir) return null;
      if (!nivel) return "Escolha aonde a equipe deve chegar ou \"Medir primeiro\".";
      if (nivel === "PERSONALIZADO" && (alvoPersNum === null || !Number.isFinite(alvoPersNum) || alvoPersNum < 0)) return "Informe o valor do alvo.";
      if (nivel === "PERSONALIZADO" && unidade === "PCT" && (alvoPersNum ?? 0) > 300) return "Percentuais vão de 0% a 300%.";
    }
    if (passo === 4) {
      const p = num(peso);
      if (p === null || !Number.isFinite(p) || p < 0.1 || p > 10) return "O peso da meta vai de 0,1 a 10.";
      if (ate && ate < desde) return "A data de fim é anterior ao início.";
    }
    return null;
  })();

  function escolherObjetivo(o: ObjetivoMeta) {
    setObjetivo(o.codigo);
    if (!o.permite_atividade) setAtividade("TODAS");
    setPrevia(null);
    setNivel(null);
    setMedir(false);
    setAlvoPers("");
  }

  function adicionarEscopo(id: string) {
    if (!id || escopo.some((e) => e.tipo === tipoEscopo && e.ref_id === id)) return;
    setEscopo([...escopo, { tipo: tipoEscopo, ref_id: id, nome: opcoesEscopo[tipoEscopo].find((o) => o.id === id)?.nome ?? null }]);
  }

  async function salvar(ativar: boolean) {
    if (!objetivo) return;
    setSalvando(true);
    setErroSalvar(null);
    try {
      const r = await salvarMetaGuiada(tenantId, {
        ...dadosBase,
        nivel: medir ? undefined : nivel ?? undefined,
        alvo: nivel === "PERSONALIZADO" ? alvoPersNum : null,
        medir_primeiro: medir,
        nome: nome.trim() || undefined,
        vigente_desde: desde,
        vigente_ate: ate || null,
        peso: num(peso),
        ativar: medir ? false : ativar,
      });
      onSalvo(r);
    } catch (e) {
      setErroSalvar(e instanceof Error ? e.message : "Não foi possível salvar a meta.");
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) return null;
  const onde = armazemId ? catalogo.armazens.find((a) => a.id === armazemId)?.nome ?? "armazém" : "toda a empresa";
  const fraseQuem = escopo.length
    ? `Vale para ${escopo.map((e) => `${ROTULO_ESCOPO[e.tipo].toLowerCase()} ${e.nome ?? ""}`.trim()).join(", ")} (${armazemId ? `armazém ${onde}` : onde}).`
    : `Vale para todos os operadores de ${armazemId ? `armazém ${onde}` : onde}.`;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="meta-guiada">
        <DialogHeader>
          <DialogTitle>{versaoDe ? "Próximo degrau" : inicial ? "Completar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>
            {versaoDe
              ? `Nova versão de "${versaoDe.nome}": a atual vale até a véspera do início desta e o histórico fica preservado.`
              : "Responda quatro perguntas; o sistema calcula o alvo a partir do que a equipe já faz."}
          </DialogDescription>
        </DialogHeader>

        <ol className="flex gap-1" aria-label="Passos">
          {PASSOS.map((p) => (
            <li key={p.n} aria-current={passo === p.n ? "step" : undefined}
              className={cn("flex flex-1 items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
                passo === p.n ? "border-primary bg-primary/10 text-primary" : passo > p.n ? "border-border text-foreground" : "border-border text-muted-foreground")}>
              <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px]", passo > p.n ? "bg-primary text-primary-foreground" : "border border-current")}>
                {passo > p.n ? <Check size={10} /> : p.n}
              </span>
              <span className="truncate">{p.rotulo}</span>
            </li>
          ))}
        </ol>

        <div className="space-y-4 text-sm">
          {/* ---------------- passo 1 */}
          {passo === 1 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <h3 className="text-base font-semibold text-foreground">O que você quer melhorar?</h3>
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Onde</span>
                  <select aria-label="Onde" className={cn(sel, "w-48")} value={armazemId ?? ""} onChange={(e) => { setArmazemId(e.target.value || null); setPrevia(null); }}>
                    <option value="">Toda a empresa</option>
                    {catalogo.armazens.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                  </select>
                </label>
              </div>
              {erroObj && <p className="text-xs text-destructive" role="alert">{erroObj}</p>}
              {carregandoObj && !objetivos ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Objetivos">
                  {objetivos?.objetivos.map((o) => (
                    <button key={o.codigo} type="button" role="radio" aria-checked={objetivo === o.codigo} onClick={() => escolherObjetivo(o)}
                      className={cn("rounded-lg border p-3 text-left transition-colors", objetivo === o.codigo ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                      <span className="flex items-start justify-between gap-2">
                        <b className="text-foreground">{o.rotulo}</b>
                        {objetivos.recomendado === o.codigo && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            <Sparkles size={10} /> Recomendado
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{o.pergunta}</span>
                      <span className={cn("mt-1.5 block text-xs", o.suficiente ? "text-foreground" : "text-muted-foreground")}>
                        {o.suficiente ? <>Hoje: <b className="tabular-nums">{formatarValorMeta(o.hoje, o.unidade)}</b>{o.unidade === "QTD" ? " por dia" : ""}</> : "Ainda sem número confiável"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {obj?.permite_atividade && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="block text-xs text-muted-foreground">Em quais tarefas?</span>
                    <select aria-label="Em quais tarefas?" className={sel} value={atividade} onChange={(e) => { setAtividade(e.target.value as Atividade); setPrevia(null); }}>
                      <option value="TODAS">Todas as tarefas</option>
                      <option value="TIPO">Uma tarefa</option>
                      {catalogo.categorias.length > 0 && <option value="CATEGORIA">Um grupo de tarefas</option>}
                    </select>
                  </label>
                  {atividade === "TIPO" && (
                    <label className="space-y-1">
                      <span className="block text-xs text-muted-foreground">Tarefa</span>
                      <select aria-label="Tarefa" className={sel} value={tipoId} onChange={(e) => { setTipoId(e.target.value); setPrevia(null); }}>
                        <option value="">Escolha…</option>
                        {tipos.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                      </select>
                    </label>
                  )}
                  {atividade === "CATEGORIA" && (
                    <label className="space-y-1">
                      <span className="block text-xs text-muted-foreground">Grupo</span>
                      <select aria-label="Grupo de tarefas" className={sel} value={categoria} onChange={(e) => { setCategoria(e.target.value); setPrevia(null); }}>
                        <option value="">Escolha…</option>
                        {catalogo.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {obj && !obj.permite_atividade && <p className="text-xs text-muted-foreground">Este objetivo olha o turno inteiro, então vale para todas as tarefas juntas.</p>}
              {objetivos && <p className="text-[11px] text-muted-foreground">"Hoje" é a mediana dos operadores de {formatDate(objetivos.janela.de)} a {formatDate(objetivos.janela.ate)}.</p>}
            </section>
          )}

          {/* ---------------- passo 2 */}
          {passo === 2 && (
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Para quem é a meta?</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEscopo([])}
                  className={cn("rounded-full border px-3 py-1 text-xs", escopo.length === 0 ? "border-primary bg-primary/10 text-primary" : "border-border")}>
                  Todos de {armazemId ? onde : "toda a empresa"}
                </button>
                {escopo.map((e) => (
                  <span key={`${e.tipo}-${e.ref_id}`} className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/10 px-3 py-1 text-xs text-primary">
                    {ROTULO_ESCOPO[e.tipo]}: {e.nome ?? e.ref_id.slice(0, 8)}
                    <button type="button" aria-label={`Remover ${e.nome ?? ""}`} onClick={() => setEscopo(escopo.filter((x) => x !== e))}><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <select aria-label="Tipo de grupo" className={sel} value={tipoEscopo} onChange={(e) => setTipoEscopo(e.target.value as TipoEscopo)}>
                  {(["EQUIPE", "TURNO", "USUARIO", "PERFIL"] as TipoEscopo[]).map((t) => <option key={t} value={t}>{ROTULO_ESCOPO[t]}</option>)}
                </select>
                <select aria-label="Adicionar" className={sel} value="" onChange={(e) => adicionarEscopo(e.target.value)}>
                  <option value="">{opcoesEscopo[tipoEscopo].length ? `Adicionar ${ROTULO_ESCOPO[tipoEscopo].toLowerCase()}…` : `Nenhum(a) ${ROTULO_ESCOPO[tipoEscopo].toLowerCase()} cadastrado(a)`}</option>
                  {opcoesEscopo[tipoEscopo].filter((o) => !escopo.some((e) => e.tipo === tipoEscopo && e.ref_id === o.id)).map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                </select>
              </div>
              <p className="rounded-md border border-border bg-muted/30 p-2 text-xs text-foreground">{fraseQuem}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Acompanhar o resultado</span>
                  <select aria-label="Acompanhar o resultado" className={sel} value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}>
                    {ACOMPANHAR.map((p) => <option key={p} value={p}>{ROTULO_PERIODICIDADE[p]}</option>)}
                  </select>
                </label>
                <p className="self-end text-[11px] text-muted-foreground">
                  {obj?.unidade === "QTD" ? "Volume muda com o período: por semana o alvo é a soma da semana." : "Taxas valem igual por dia, semana ou mês; muda só quando o resultado fecha."}
                </p>
              </div>
            </section>
          )}

          {/* ---------------- passo 3 */}
          {passo === 3 && obj && (
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Onde a equipe está e aonde quer chegar</h3>
              {erroPrevia && <p className="text-xs text-destructive" role="alert">{erroPrevia}</p>}
              {!previa ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <LinhaBaseCard previa={previa} rotulo={obj.rotulo} />
                  {versaoDe?.alvo != null && (
                    <p className="text-xs text-muted-foreground" data-testid="alvo-atual">Alvo atual: <b className="text-foreground">{formatarValorMeta(versaoDe.alvo, unidade)}</b></p>
                  )}
                  {previa.avisos.map((a) => (
                    <p key={a.codigo} className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300" role="status">
                      <TriangleAlert size={13} className="mt-0.5 shrink-0" /> {a.mensagem}
                    </p>
                  ))}
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Aonde quer chegar">
                    {previa.niveis.map((n) => (
                      <button key={n.codigo} type="button" role="radio" aria-checked={!medir && nivel === n.codigo}
                        onClick={() => { setNivel(n.codigo); setMedir(false); }}
                        className={cn("rounded-lg border p-3 text-left", !medir && nivel === n.codigo ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                        <span className="flex items-center justify-between gap-2">
                          <b className="text-foreground">{ROTULO_NIVEL[n.codigo].titulo}{n.pct ? ` · ${previa.menor_melhor ? "−" : "+"}${n.pct}%` : ""}</b>
                          {n.recomendado && <span className="rounded-full border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">Recomendado</span>}
                        </span>
                        <span className="block text-xs text-muted-foreground">{ROTULO_NIVEL[n.codigo].frase}</span>
                        <span className="mt-1.5 block text-lg font-semibold tabular-nums text-foreground">{formatarValorMeta(n.alvo, unidade)}</span>
                        <AvaliacaoLinha atingem={n.atingem} comDado={previa.linha_base.com_dado} realismo={n.realismo} />
                        {n.limitado && <span className="mt-1 block text-[11px] text-muted-foreground">Limitado ao que os melhores da equipe já sustentam.</span>}
                      </button>
                    ))}
                    <div role="radio" aria-checked={!medir && nivel === "PERSONALIZADO"} tabIndex={0}
                      onClick={() => { setNivel("PERSONALIZADO"); setMedir(false); }}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { setNivel("PERSONALIZADO"); setMedir(false); } }}
                      className={cn("cursor-pointer rounded-lg border p-3", !medir && nivel === "PERSONALIZADO" ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
                      <b className="text-foreground">{ROTULO_NIVEL.PERSONALIZADO.titulo}</b>
                      <span className="block text-xs text-muted-foreground">Para um alvo definido pela diretoria.</span>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Input aria-label="Outro valor" className="h-8 w-28" inputMode="decimal" value={alvoPers}
                          onFocus={() => { setNivel("PERSONALIZADO"); setMedir(false); }}
                          onChange={(e) => setAlvoPers(e.target.value)} />
                        <span className="text-xs text-muted-foreground">{unidade === "PCT" ? "%" : unidade === "POR_HORA" ? "por hora" : unidade === "MIN" ? "minutos" : "unidades"}</span>
                      </div>
                      {previa.personalizado && alvoPersNum !== null && (
                        <AvaliacaoLinha atingem={previa.personalizado.atingem} comDado={previa.linha_base.com_dado} realismo={previa.personalizado.realismo} />
                      )}
                    </div>
                  </div>
                  {!versaoDe && <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-3", medir ? "border-primary bg-primary/5" : "border-dashed border-border")}>
                    <input type="radio" className="mt-1" name="medir" checked={medir} onChange={() => { setMedir(true); setNivel(null); }} />
                    <span>
                      <b className="text-foreground">Medir primeiro</b>
                      <span className="block text-xs text-muted-foreground">
                        A meta fica medindo a equipe por {previa.medir_dias} dias, sem valer no score. Depois o sistema sugere o alvo e você ativa.
                      </span>
                    </span>
                  </label>}
                </>
              )}
            </section>
          )}

          {/* ---------------- passo 4 */}
          {passo === 4 && obj && previa && (
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-foreground">Revise e ative</h3>
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-base font-medium text-foreground" data-testid="frase-meta">
                  {fraseMeta({ verbo: obj.verbo, menor_melhor: previa.menor_melhor }, unidade, base?.suficiente ? base.mediana : null, alvoFinal)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {fraseQuem} Resultado {ROTULO_PERIODICIDADE[periodicidade].toLowerCase()}.
                  {atividade === "TIPO" && ` Só a tarefa ${tipos.find((t) => t.id === tipoId)?.descricao ?? ""}.`}
                  {atividade === "CATEGORIA" && ` Só o grupo ${categoria}.`}
                </p>
                {avaliacaoFinal && !medir && <AvaliacaoLinha atingem={avaliacaoFinal.atingem} comDado={previa.linha_base.com_dado} realismo={avaliacaoFinal.realismo} />}
                {medir && <p className="mt-1 text-xs text-foreground">Sem alvo por enquanto: fica como rascunho "medindo" por {previa.medir_dias} dias.</p>}
              </div>

              {!medir && alvoFinal !== null && (
                <div className="flex items-start gap-3 rounded-lg border border-border p-3" aria-label="Como o operador vê no coletor">
                  <Smartphone size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="text-xs">
                    <p className="text-muted-foreground">No coletor, o operador vê:</p>
                    <p className="mt-1 font-medium text-foreground">{obj.rotulo}</p>
                    <p className="text-foreground">Meta {formatarValorMeta(alvoFinal, unidade)} · {periodicidade === "DIARIO" ? "hoje" : periodicidade === "SEMANAL" ? "nesta semana" : "neste mês"}</p>
                    <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 bg-primary" /></div>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border">
                <button type="button" className="flex w-full items-center justify-between p-2.5 text-xs font-medium text-foreground" aria-expanded={avancado}
                  onClick={() => setAvancado(!avancado)}>
                  <span className="flex items-center gap-1.5"><Settings2 size={13} /> Ajustes avançados</span>
                  <ChevronDown size={14} className={cn("transition-transform", avancado && "rotate-180")} />
                </button>
                {avancado && (
                  <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="guiada-nome">Nome</Label>
                      <Input id="guiada-nome" value={nome} maxLength={80} placeholder="Gerado pelo objetivo e por quem a meta vale" onChange={(e) => setNome(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="guiada-desde">Vale a partir de</Label>
                      <Input id="guiada-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="guiada-ate">Até (opcional)</Label>
                      <Input id="guiada-ate" type="date" value={ate} min={desde} onChange={(e) => setAte(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="guiada-peso">Peso no score</Label>
                      <Input id="guiada-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} />
                    </div>
                    <p className="self-end text-[11px] text-muted-foreground">
                      Mínimo aceitável e excelência são calculados pelo sistema a partir do resultado de hoje e do alvo. Para mudar um a um, use o modo avançado.
                    </p>
                  </div>
                )}
              </div>
            </section>
          )}

          {erroSalvar && <p className="text-xs text-destructive" role="alert">{erroSalvar}</p>}
          {bloqueio && (passo === 1 || (passo >= 3 && !!previa)) && <p className="text-xs text-muted-foreground" role="status">{bloqueio}</p>}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="link" className="h-auto px-0 text-xs text-muted-foreground" onClick={onModoAvancado} disabled={salvando}>
            Modo avançado (preencher campo a campo)
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            {passo > 1 ? (
              <Button variant="outline" onClick={() => setPasso((passo - 1) as Passo)} disabled={salvando}><ArrowLeft size={14} className="mr-1" /> Voltar</Button>
            ) : (
              <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
            )}
            {passo < 4 ? (
              <Button onClick={() => setPasso((passo + 1) as Passo)} disabled={!!bloqueio}>Continuar <ArrowRight size={14} className="ml-1" /></Button>
            ) : medir ? (
              <Button onClick={() => salvar(false)} disabled={!!bloqueio || salvando}>
                {salvando && <Loader2 size={14} className="mr-1 animate-spin" />} Salvar e começar a medir
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => salvar(false)} disabled={!!bloqueio || salvando}>Salvar rascunho</Button>
                <Button onClick={() => salvar(true)} disabled={!!bloqueio || salvando}>
                  {salvando && <Loader2 size={14} className="mr-1 animate-spin" />}{exigeAprovacao ? "Enviar para aprovação" : versaoDe ? "Ativar nova versão" : "Ativar meta"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvaliacaoLinha({ atingem, comDado, realismo }: { atingem: number; comDado: number; realismo: keyof typeof ROTULO_REALISMO }) {
  const r = ROTULO_REALISMO[realismo];
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className={cn("rounded-full border px-1.5 py-0.5 font-medium", r.classe)}>{r.texto}</span>
      {realismo !== "SEM_BASE" && <span className="text-muted-foreground">{frasePessoasAtingem(atingem, comDado)}</span>}
    </span>
  );
}

function LinhaBaseCard({ previa, rotulo }: { previa: PreviaMeta; rotulo: string }) {
  const b = previa.linha_base;
  const u = previa.unidade;
  if (!b.suficiente) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs" data-testid="linha-base">
        <p className="font-medium text-foreground">{rotulo}: ainda sem número confiável</p>
        <p className="mt-0.5 text-muted-foreground">{b.motivo}</p>
        <p className="mt-1 text-muted-foreground">Use "Medir primeiro" ou informe outro valor.</p>
      </div>
    );
  }
  const vals = b.valores ?? [];
  const min = Math.min(...vals, b.mediana ?? 0);
  const max = Math.max(...vals, b.mediana ?? 0);
  const pos = (v: number) => (max === min ? 50 : ((v - min) / (max - min)) * 100);
  const t = b.tendencia;
  const TIcon = !t || t.direcao === "ESTAVEL" ? Minus : (t.variacao > 0 ? TrendingUp : TrendingDown);
  return (
    <div className="rounded-lg border border-border p-3" data-testid="linha-base">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Hoje a equipe está em</p>
          <p className="text-2xl font-semibold tabular-nums text-foreground">{formatarValorMeta(b.mediana, u)}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Metade dos operadores entre {formatarValorMeta(b.p25, u)} e {formatarValorMeta(b.p75, u)}</p>
          <p>Os melhores sustentam {formatarValorMeta(b.p90, u)}</p>
          {t && (
            <p className={cn("mt-0.5 inline-flex items-center gap-1", t.direcao === "MELHORANDO" ? "text-green-600 dark:text-green-400" : t.direcao === "PIORANDO" ? "text-red-600 dark:text-red-400" : "")}>
              <TIcon size={12} /> {t.direcao === "ESTAVEL" ? "Estável" : t.direcao === "MELHORANDO" ? "Melhorando" : "Piorando"} nas últimas 4 semanas
            </p>
          )}
        </div>
      </div>
      {vals.length > 1 && (
        <div className="relative mt-3 h-6" aria-label="Onde cada operador está" role="img">
          <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
          {vals.map((v, i) => (
            <span key={i} className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" style={{ left: `${pos(v)}%` }} title={formatarValorMeta(v, u)} />
          ))}
          {b.mediana != null && <span className="absolute top-0 h-6 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${pos(b.mediana)}%` }} />}
        </div>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        {b.com_dado} de {b.participantes} operadores com dado suficiente, de {formatDate(b.janela.de)} a {formatDate(b.janela.ate)}.
        {b.pct_inicio_real != null && ` Início registrado no coletor em ${b.pct_inicio_real.toLocaleString("pt-BR")}% das tarefas.`}
      </p>
    </div>
  );
}

