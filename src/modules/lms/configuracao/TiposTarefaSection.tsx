import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarClock, ListChecks, Loader2, Lock, Pencil, Save, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/utils/dateTime";
import {
  RESERVA_ACAO_AJUDA, RESERVA_EXPIRA_MAX_HORAS, RESERVA_EXPIRA_MIN_HORAS, formatarHoras, reservaAcaoLabel,
} from "@/lib/reservaTarefa";
import {
  CATEGORIAS_TIPO_TAREFA, LmsConfigErro, TIPOS_MOVIMENTO, descreverHistoricoTipo, descreverOrigem, descreverPadrao, listarTiposTarefaLms,
  rotuloMovimento, salvarTipoTarefaCompleto, type DadosTipoTarefa, type HistoricoTipoTarefa, type PadraoParaSalvar, type PadraoTempoConfig,
  type RegraSistema, type ReservaAcaoTipo, type TipoTarefaLms,
  padraoCalibrado,
} from "./lmsConfig.service";
import { PadraoTempoCampos, edicaoPadraoInicial, partesDaEdicao, validarEdicaoPadrao, type EdicaoPadrao } from "./PadraoTempoCampos";

/**
 * Fase 10.11 · tipo de tarefa e tempo padrão numa tela só.
 * Cadastro e "sem atividade" valem para todas as empresas; o tempo padrão vale para o nível
 * escolhido no topo da tela (empresa ou armazém). Um Salvar grava tudo junto, no banco, em uma
 * transação (rpc_lms_tipo_tarefa_salvar_completo).
 */
interface Props {
  tenantId: string;
  empresaId: string;
  armazemId: string | null;
  nivelTela: "EMPRESA" | "ARMAZEM";
  nomeNivel: string;
  hoje: string;
  padroes: PadraoTempoConfig[];
  regrasSistema: RegraSistema[];
  podeRetroativo: boolean;
  /** depois de salvar: a página recarrega as regras e, se a data foi no passado, oferece reprocessar */
  onSalvo: (r: { requerReprocessamento: boolean; vigenteDesde: string | null }) => void;
  onExcluirAgendado: (id: string) => void;
}

interface FormCadastro {
  ativo: boolean;
  categoria: string;
  tipo_movimento: string;
  peso_produtividade: string;
  cor_interface: string;
  somente_sistema: boolean;
  reserva_acao: ReservaAcaoTipo;
  reserva_horas: string;
}

type Aba = "cadastro" | "tempo" | "reserva" | "historico";

const COR_PADRAO = "#6366f1";

function paraForm(t: TipoTarefaLms): FormCadastro {
  return {
    ativo: t.ativo,
    categoria: t.categoria ?? "",
    tipo_movimento: t.tipo_movimento != null ? String(t.tipo_movimento) : "",
    peso_produtividade: String(t.peso_produtividade ?? 1),
    cor_interface: t.cor_interface ?? "",
    somente_sistema: !!t.somente_sistema,
    reserva_acao: t.reserva_acao,
    reserva_horas: String((t.reserva_expira_min ?? 240) / 60),
  };
}

function dadosDoForm(f: FormCadastro, t: TipoTarefaLms): DadosTipoTarefa {
  return {
    ativo: f.ativo,
    categoria: f.categoria || null,
    tipo_movimento: f.tipo_movimento ? Number(f.tipo_movimento) : null,
    peso_produtividade: Number(f.peso_produtividade),
    cor_interface: f.cor_interface || null,
    somente_sistema: f.somente_sistema,
    reserva_acao: f.reserva_acao,
    reserva_expira_min: f.reserva_acao === "NUNCA" ? t.reserva_expira_min : Math.round(Number(f.reserva_horas) * 60),
  };
}

/** O cadastro mudou em relação ao que veio do banco? (se não, o Salvar não manda essa parte) */
export function cadastroAlterado(f: FormCadastro, t: TipoTarefaLms): boolean {
  const d = dadosDoForm(f, t);
  return d.ativo !== t.ativo || d.categoria !== (t.categoria ?? null) || d.tipo_movimento !== (t.tipo_movimento ?? null)
    || Number(d.peso_produtividade) !== Number(t.peso_produtividade)
    || d.cor_interface !== (t.cor_interface ?? null) || d.somente_sistema !== !!t.somente_sistema || d.reserva_acao !== t.reserva_acao || d.reserva_expira_min !== t.reserva_expira_min;
}

/** Valida o cadastro antes de enviar; o banco valida de novo. */
export function validarFormTipo(f: Pick<FormCadastro, "peso_produtividade" | "reserva_acao" | "reserva_horas" | "cor_interface">): string | null {
  const peso = Number(f.peso_produtividade);
  if (!Number.isFinite(peso) || peso < 0.1 || peso > 10) return "O peso de produtividade vai de 0,1 a 10.";
  if (f.cor_interface && !/^#[0-9a-fA-F]{6}$/.test(f.cor_interface)) return "Cor inválida.";
  if (f.reserva_acao !== "NUNCA") {
    const h = Number(f.reserva_horas);
    if (!Number.isFinite(h) || h < RESERVA_EXPIRA_MIN_HORAS || h > RESERVA_EXPIRA_MAX_HORAS) {
      return `O prazo sem atividade deve ficar entre 15 minutos e ${RESERVA_EXPIRA_MAX_HORAS} horas.`;
    }
  }
  return null;
}

// ── ordenação da grade (clique no título: A→Z, de novo: Z→A) ──
export type ColunaOrdem = "tipo" | "categoria" | "movimento" | "tempo" | "reserva" | "situacao";
export interface Ordem { coluna: ColunaOrdem; direcao: "asc" | "desc" }

const comparaTexto = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });

/** Tempo de 1 tarefa de 1 unidade no padrão, para ordenar; sem padrão vai para o fim. */
function segundosPadrao(p: PadraoTempoConfig | undefined): number | null {
  if (!p) return null;
  const fixo = Number(p.efetivo.tempo_fixo_seg ?? 0); const un = Number(p.efetivo.tempo_unidade_seg ?? 0);
  if (fixo <= 0 && un <= 0) return null;
  return (fixo + un) * (1 + Number(p.efetivo.pfd_pct ?? 0) / 100);
}

export function ordenarTipos(tipos: TipoTarefaLms[], ordem: Ordem, padraoPorTipo: Map<string, PadraoTempoConfig>): TipoTarefaLms[] {
  const fator = ordem.direcao === "asc" ? 1 : -1;
  const vazio = (v: string | null | undefined) => v === null || v === undefined || v === "" || v === "—";
  const texto = (t: TipoTarefaLms): string | null => {
    switch (ordem.coluna) {
      case "tipo": return `${t.codigo} ${t.descricao}`;
      case "categoria": return t.categoria;
      case "movimento": { const m = rotuloMovimento(t.tipo_movimento); return m === "—" ? null : m; }
      case "reserva": return `${reservaAcaoLabel(t.reserva_acao)} ${String(t.reserva_expira_min).padStart(6, "0")}`;
      case "situacao": return t.ativo ? "Ativo" : "Inativo";
      default: return null;
    }
  };
  return [...tipos].sort((a, b) => {
    if (ordem.coluna === "tempo") {
      const x = segundosPadrao(padraoPorTipo.get(a.id)); const y = segundosPadrao(padraoPorTipo.get(b.id));
      if (x === null || y === null) return x === y ? comparaTexto(a.codigo, b.codigo) : x === null ? 1 : -1; // sem padrão sempre no fim
      return (x - y) * fator || comparaTexto(a.codigo, b.codigo);
    }
    const x = texto(a); const y = texto(b);
    if (vazio(x) || vazio(y)) return vazio(x) === vazio(y) ? comparaTexto(a.codigo, b.codigo) : vazio(x) ? 1 : -1; // vazios no fim
    return comparaTexto(x as string, y as string) * fator || comparaTexto(a.codigo, b.codigo);
  });
}

function OrigemPadrao({ p, nivelTela }: { p: PadraoTempoConfig; nivelTela: "EMPRESA" | "ARMAZEM" }) {
  const proprio = p.efetivo.nivel === nivelTela;
  return (
    <span className={cn("ml-1.5 inline-flex rounded-full border px-1.5 text-[10px]",
      proprio ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/40 text-muted-foreground")}>
      {descreverOrigem(p.efetivo.nivel, nivelTela)}{p.efetivo.origem === "CALIBRADO" ? " · calibrado" : ""}
    </span>
  );
}

/** Fase 10.20 (P12): o padrão migrado ou digitado ainda não foi conferido com a operação real. */
function SeloNaoCalibrado({ origem }: { origem: string | null | undefined }) {
  if (padraoCalibrado(origem)) return null;
  return (
    <span className="ml-1.5 inline-flex rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
      title="Este tempo padrão ainda não foi conferido com execuções reais. Abra o tipo e use &quot;Sugerir pelo histórico&quot;.">
      Não calibrado
    </span>
  );
}

export function TiposTarefaSection({
  tenantId, empresaId, armazemId, nivelTela, nomeNivel, hoje, padroes, regrasSistema, podeRetroativo, onSalvo, onExcluirAgendado,
}: Props) {
  const [tipos, setTipos] = useState<TipoTarefaLms[]>([]);
  const [historico, setHistorico] = useState<HistoricoTipoTarefa[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<TipoTarefaLms | null>(null);
  const [aba, setAba] = useState<Aba>("cadastro");
  const [form, setForm] = useState<FormCadastro | null>(null);
  const [edPadrao, setEdPadrao] = useState<EdicaoPadrao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>({ coluna: "tipo", direcao: "asc" });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listarTiposTarefaLms(tenantId, empresaId, armazemId);
      setTipos(r.tipos);
      setHistorico(r.historico);
      setPodeEditar(r.pode_editar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os tipos de tarefa.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId, empresaId, armazemId]);

  useEffect(() => { carregar(); }, [carregar]);

  const padraoPorTipo = useMemo(() => new Map(padroes.map((p) => [p.tipo_tarefa_id, p])), [padroes]);
  const regraPorCodigo = useMemo(() => new Map(regrasSistema.map((r) => [r.tipo_codigo, r])), [regrasSistema]);
  const filtrados = useMemo(() => {
    const s = busca.trim().toLowerCase();
    const lista = s ? tipos.filter((t) => t.codigo.toLowerCase().includes(s) || t.descricao.toLowerCase().includes(s)) : tipos;
    return ordenarTipos(lista, ordem, padraoPorTipo);
  }, [tipos, busca, ordem, padraoPorTipo]);

  const ordenarPor = (coluna: ColunaOrdem) =>
    setOrdem((o) => (o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }));

  function Titulo({ coluna, children }: { coluna: ColunaOrdem; children: string }) {
    const ativo = ordem.coluna === coluna;
    const Icone = !ativo ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className="px-4 py-2 text-left font-medium" aria-sort={ativo ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}>
        <button type="button" onClick={() => ordenarPor(coluna)}
          className={cn("inline-flex items-center gap-1 hover:text-foreground", ativo && "text-foreground")}
          title={ativo && ordem.direcao === "asc" ? "Ordenar de Z a A" : "Ordenar de A a Z"}>
          {children} <Icone size={12} className={cn(!ativo && "opacity-40")} />
        </button>
      </th>
    );
  }

  function abrir(t: TipoTarefaLms, abaInicial: Aba = "cadastro") {
    setEditando(t);
    setForm(paraForm(t));
    setEdPadrao(edicaoPadraoInicial(padraoPorTipo.get(t.id), hoje));
    setMotivo("");
    setAba(abaInicial);
  }

  function fechar() {
    setEditando(null);
    setForm(null);
    setEdPadrao(null);
  }

  const set = <K extends keyof FormCadastro>(k: K, v: FormCadastro[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const padraoEditando = editando ? padraoPorTipo.get(editando.id) : undefined;
  const mudouCadastro = !!(editando && form && cadastroAlterado(form, editando));
  const mudouPadrao = !!(edPadrao?.alterado && padraoEditando);
  const erroCadastro = form && mudouCadastro ? validarFormTipo(form) : null;
  const erroPadrao = edPadrao && mudouPadrao ? validarEdicaoPadrao(edPadrao, { hoje, podeRetroativo, motivo }) : null;
  const erro = erroCadastro ?? erroPadrao;

  async function salvar() {
    if (!editando || !form || !edPadrao) return;
    if (!mudouCadastro && !mudouPadrao) { toast.info("Nada mudou."); return; }
    if (erroCadastro) { setAba(erroCadastro.includes("prazo") ? "reserva" : "cadastro"); toast.error(erroCadastro); return; }
    if (erroPadrao) { setAba("tempo"); toast.error(erroPadrao); return; }
    let padrao: PadraoParaSalvar | null = null;
    if (mudouPadrao) {
      const p = partesDaEdicao(edPadrao);
      padrao = {
        empresa_id: empresaId, armazem_id: armazemId, herdar: edPadrao.herdar, origem: edPadrao.origem, vigente_desde: edPadrao.vigencia,
        ...(edPadrao.herdar ? {} : { tempo_fixo_seg: p.fixo, tempo_unidade_seg: p.unidade, pfd_pct: p.pfd }),
      };
    }
    setSalvando(true);
    try {
      const r = await salvarTipoTarefaCompleto({
        tenantId, tipoTarefaId: editando.id, motivo: motivo.trim() || null,
        cadastro: mudouCadastro ? dadosDoForm(form, editando) : null, padrao,
      });
      toast.success(r.mensagem || "Tipo de tarefa atualizado.");
      fechar();
      await carregar();
      onSalvo({ requerReprocessamento: r.requer_reprocessamento, vigenteDesde: r.vigente_desde });
    } catch (e) {
      toast.error(e instanceof LmsConfigErro ? e.message : "Não foi possível salvar o tipo de tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  const historicoDoTipo = editando ? historico.filter((h) => h.tipo_tarefa_id === editando.id) : [];
  const inputClass = "w-full h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";
  const alcanceTodas = <p className="mb-3 text-xs text-muted-foreground">Vale para <b>todas as empresas</b>.</p>;

  return (
    <section id="lms-tipos-tarefa" className="scroll-mt-20 rounded-lg border border-border bg-card" data-testid="lms-tipos-tarefa">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <ListChecks size={18} className="mt-0.5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Tipos de tarefa</h2>
            <p className="text-xs text-muted-foreground">
              Cadastro, tempo padrão e o que fazer quando o operador fica sem atividade. O tempo padrão é o de <b>{nomeNivel}</b>
              {" "}(troque o nível no topo da tela); o restante vale para todas as empresas.
            </p>
          </div>
        </div>
        <label className="relative">
          <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" />
          <input aria-label="Buscar tipo de tarefa" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Código ou descrição" className="h-9 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-sm" />
        </label>
      </header>

      {carregando && tipos.length === 0 ? (
        <div className="flex justify-center py-8 text-muted-foreground"><Loader2 className="animate-spin" /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <Titulo coluna="tipo">Tipo de tarefa</Titulo>
                <Titulo coluna="categoria">Categoria</Titulo>
                <Titulo coluna="movimento">Movimento</Titulo>
                <Titulo coluna="tempo">Tempo padrão</Titulo>
                <Titulo coluna="reserva">Sem atividade</Titulo>
                <Titulo coluna="situacao">Situação</Titulo>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((t) => {
                const p = padraoPorTipo.get(t.id);
                return (
                  <tr key={t.id} className={cn("border-b border-border last:border-0", !t.ativo && "opacity-60")}>
                    <td className="px-4 py-2">
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: t.cor_interface || COR_PADRAO }} />
                      <span className="font-mono text-xs text-muted-foreground">{t.codigo}</span>{" "}
                      <span className="text-foreground">{t.descricao}</span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{t.categoria ?? "—"}</td>
                    <td className="px-4 py-2 text-muted-foreground">{rotuloMovimento(t.tipo_movimento)}</td>
                    <td className="px-4 py-2">
                      {p ? (
                        <>
                          <span className="font-semibold tabular-nums text-foreground">
                            {p.efetivo.tempo_fixo_seg > 0 || Number(p.efetivo.tempo_unidade_seg ?? 0) > 0
                              ? descreverPadrao(p.efetivo, p.unidade_medida) : "sem padrão"}
                          </span>
                          <OrigemPadrao p={p} nivelTela={nivelTela} />
                          <SeloNaoCalibrado origem={p.efetivo.origem} />
                          {p.agendados.length > 0 && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400"
                              title={p.agendados.map((a) => formatDate(a.vigente_desde)).join(", ")}>
                              <CalendarClock size={11} /> {p.agendados.length} agendado(s)
                            </span>
                          )}
                        </>
                      ) : <span className="text-xs text-muted-foreground">tipo inativo</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {reservaAcaoLabel(t.reserva_acao)}{t.reserva_acao !== "NUNCA" ? ` · ${formatarHoras(t.reserva_expira_min)}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("rounded-full border px-2 py-0.5 text-[11px]",
                        t.ativo ? "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" : "border-border bg-muted/40 text-muted-foreground")}>
                        {t.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" aria-label={`${podeEditar ? "Editar" : "Ver"} ${t.codigo}`} onClick={() => abrir(t)}>
                        {podeEditar ? <Pencil size={14} /> : <Lock size={13} />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum tipo de tarefa encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!editando} onOpenChange={(v) => !v && !salvando && fechar()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>{editando ? `${editando.codigo} · ${editando.descricao}` : "Tipo de tarefa"}</SheetTitle>
            <SheetDescription>{podeEditar ? "Altere o que precisar nas abas e salve uma vez." : "Somente leitura: só o gerente altera as regras do LMS."}</SheetDescription>
          </SheetHeader>
          {editando && form && edPadrao && (
            <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)} className="flex-1 overflow-y-auto px-6 py-4">
              <TabsList className="mb-4">
                <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
                <TabsTrigger value="tempo">Tempo padrão{mudouPadrao ? " •" : ""}</TabsTrigger>
                <TabsTrigger value="reserva">Sem atividade</TabsTrigger>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="cadastro">
                {alcanceTodas}
                <fieldset disabled={!podeEditar} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div><span className={labelClass}>Código</span><input value={editando.codigo} disabled className={inputClass} /></div>
                  <div><span className={labelClass}>Descrição</span><input value={editando.descricao} disabled className={inputClass} /></div>
                  <label>
                    <span className={labelClass}>Categoria</span>
                    <select className={inputClass} value={form.categoria} onChange={(e) => set("categoria", e.target.value)}>
                      <option value="">—</option>
                      {CATEGORIAS_TIPO_TAREFA.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Tipo de movimento</span>
                    <select className={inputClass} value={form.tipo_movimento} onChange={(e) => set("tipo_movimento", e.target.value)}>
                      <option value="">Não se aplica</option>
                      {TIPOS_MOVIMENTO.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Peso de produtividade</span>
                    <input className={inputClass} type="number" step="0.1" min="0.1" max="10" value={form.peso_produtividade}
                      onChange={(e) => set("peso_produtividade", e.target.value)} />
                  </label>
                  <div>
                    <span className={labelClass}>Cor nos gráficos</span>
                    <div className="flex items-center gap-2">
                      <input type="color" aria-label="Cor nos gráficos" value={form.cor_interface || COR_PADRAO}
                        onChange={(e) => set("cor_interface", e.target.value)}
                        className="h-9 w-14 cursor-pointer rounded-md border border-border bg-background" />
                      <span className="font-mono text-xs text-muted-foreground">{form.cor_interface || COR_PADRAO}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 self-end">
                    <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} aria-label="Ativo" disabled={!podeEditar} />
                    <span className="text-sm text-foreground">Ativo</span>
                  </div>
                </fieldset>
                <div className="mt-4 flex items-start gap-3 rounded-md border border-border p-3">
                  <Switch checked={form.somente_sistema} onCheckedChange={(v) => set("somente_sistema", v)}
                    aria-label="Executado só pelo sistema" disabled={!podeEditar} />
                  <div>
                    <span className="text-sm text-foreground">Executado só pelo sistema</span>
                    <p className="text-xs text-muted-foreground">
                      Para tarefas feitas pela máquina, sem operador (ex.: separação automática). As execuções desse tipo ficam
                      fora de produtividade, relatórios de colaborador e Dashboard. Vale para as execuções feitas a partir de agora.
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">Metas por hora são definidas em Produtividade (LMS) › Metas.</p>
              </TabsContent>

              <TabsContent value="tempo">
                <p className="mb-3 text-xs text-muted-foreground">
                  Vale para <b>{nomeNivel}</b>{nivelTela === "EMPRESA" ? " e os armazéns dela sem regra própria" : ""}.
                </p>
                {padraoEditando ? (
                  <PadraoTempoCampos padrao={padraoEditando} edicao={edPadrao} onChange={setEdPadrao}
                    motivo={motivo} onMotivo={setMotivo} hoje={hoje} podeRetroativo={podeRetroativo} podeEditar={podeEditar}
                    regraSistema={regraPorCodigo.get(editando.codigo) ?? null}
                    contexto={{ tenantId, empresaId, armazemId }} onExcluirAgendado={onExcluirAgendado} />
                ) : (
                  <p className="text-sm text-muted-foreground">Tipo inativo: ative-o no Cadastro para ver e definir o tempo padrão.</p>
                )}
              </TabsContent>

              <TabsContent value="reserva">
                {alcanceTodas}
                <fieldset disabled={!podeEditar} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label>
                    <span className={labelClass}>Quando o operador ficar sem atividade</span>
                    <select className={inputClass} value={form.reserva_acao}
                      onChange={(e) => set("reserva_acao", e.target.value as ReservaAcaoTipo)}>
                      {editando.acoes_reserva.map((a) => <option key={a} value={a}>{reservaAcaoLabel(a)}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className={labelClass}>Prazo sem atividade (horas)</span>
                    <input className={inputClass} type="number" step={0.25} min={RESERVA_EXPIRA_MIN_HORAS} max={RESERVA_EXPIRA_MAX_HORAS}
                      value={form.reserva_horas} disabled={form.reserva_acao === "NUNCA"}
                      onChange={(e) => set("reserva_horas", e.target.value)} />
                  </label>
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    {RESERVA_ACAO_AJUDA[form.reserva_acao]} Atividade = atribuição, último bip ou execução do operador em tarefas
                    deste tipo no mesmo documento. Verificado a cada 10 minutos; designações feitas pelo gestor e coletas pendentes
                    nunca são liberadas sozinhas (geram aviso ao supervisor).
                  </p>
                </fieldset>
              </TabsContent>

              <TabsContent value="historico">
                <p className="mb-3 text-xs text-muted-foreground">Cadastro (todas as empresas) e tempo padrão de {nomeNivel}.</p>
                {historicoDoTipo.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {historicoDoTipo.map((h, i) => (
                      <li key={`${h.tipo}-${h.alterado_em}-${i}`} className="px-3 py-2 text-xs">
                        <span className={cn("mr-1.5 rounded-full border px-1.5 text-[10px]",
                          h.tipo === "PADRAO_TEMPO" ? "border-primary/40 text-primary" : "border-border text-muted-foreground")}>
                          {h.tipo === "PADRAO_TEMPO" ? "Tempo padrão" : "Cadastro"}
                        </span>
                        <span className="text-foreground">{descreverHistoricoTipo(h, reservaAcaoLabel, editando.unidade_medida)}</span>
                        <span className="block text-muted-foreground">
                          {h.alterado_por ?? "Sistema"} em {formatDateTime(h.alterado_em)}{h.motivo ? ` · ${h.motivo}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          )}
          {podeEditar && (
            <div className="border-t border-border px-6 pt-3 shrink-0">
              <label className="block">
                <span className={labelClass}>
                  Motivo da alteração {edPadrao && mudouPadrao && edPadrao.vigencia < hoje ? "(obrigatório: data no passado)" : "(opcional)"}
                </span>
                <input className={inputClass} value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: estudo de tempos de outubro" />
              </label>
              {erro && <p className="mt-2 text-xs text-destructive" role="alert">{erro}</p>}
            </div>
          )}
          <SheetFooter className="px-6 py-4 shrink-0 flex-row justify-end gap-2">
            <Button variant="outline" onClick={fechar} disabled={salvando}>{podeEditar ? "Cancelar" : "Fechar"}</Button>
            {podeEditar && (
              <Button onClick={salvar} disabled={salvando || !!erro || (!mudouCadastro && !mudouPadrao)}>
                {salvando ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
                {salvando ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
