import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, ListChecks, Loader2, Lock, Pencil, Save, Search, Timer } from "lucide-react";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import {
  RESERVA_ACAO_AJUDA, RESERVA_EXPIRA_MAX_HORAS, RESERVA_EXPIRA_MIN_HORAS, formatarHoras, reservaAcaoLabel,
} from "@/lib/reservaTarefa";
import {
  CATEGORIAS_TIPO_TAREFA, LmsConfigErro, TIPOS_MOVIMENTO, descreverMudancaTipo, descreverPadrao, listarTiposTarefaLms,
  rotuloMovimento, salvarTipoTarefaLms, type HistoricoTipoTarefa, type PadraoTempoConfig, type ReservaAcaoTipo, type TipoTarefaLms,
} from "./lmsConfig.service";

interface Props {
  tenantId: string;
  /** tempos padrão do nível em tela (empresa ou armazém), para mostrar ao lado do cadastro */
  padroes: PadraoTempoConfig[];
  nomeNivel: string;
  onEditarPadrao: (p: PadraoTempoConfig) => void;
}

interface Form {
  ativo: boolean;
  categoria: string;
  tipo_movimento: string;
  unidade_medida: string;
  peso_produtividade: string;
  cor_interface: string;
  reserva_acao: ReservaAcaoTipo;
  reserva_horas: string;
  motivo: string;
}

const COR_PADRAO = "#6366f1";

function paraForm(t: TipoTarefaLms): Form {
  return {
    ativo: t.ativo,
    categoria: t.categoria ?? "",
    tipo_movimento: t.tipo_movimento != null ? String(t.tipo_movimento) : "",
    unidade_medida: t.unidade_medida ?? "",
    peso_produtividade: String(t.peso_produtividade ?? 1),
    cor_interface: t.cor_interface ?? "",
    reserva_acao: t.reserva_acao,
    reserva_horas: String((t.reserva_expira_min ?? 240) / 60),
    motivo: "",
  };
}

/** Valida o formulário antes de enviar; o banco valida de novo. */
export function validarFormTipo(f: Pick<Form, "peso_produtividade" | "reserva_acao" | "reserva_horas" | "cor_interface">): string | null {
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

export function TiposTarefaSection({ tenantId, padroes, nomeNivel, onEditarPadrao }: Props) {
  const [tipos, setTipos] = useState<TipoTarefaLms[]>([]);
  const [historico, setHistorico] = useState<HistoricoTipoTarefa[]>([]);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<TipoTarefaLms | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await listarTiposTarefaLms(tenantId);
      setTipos(r.tipos);
      setHistorico(r.historico);
      setPodeEditar(r.pode_editar);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível carregar os tipos de tarefa.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  const padraoPorTipo = useMemo(() => new Map(padroes.map((p) => [p.tipo_tarefa_id, p])), [padroes]);
  const filtrados = useMemo(() => {
    const s = busca.trim().toLowerCase();
    return s ? tipos.filter((t) => t.codigo.toLowerCase().includes(s) || t.descricao.toLowerCase().includes(s)) : tipos;
  }, [tipos, busca]);

  function abrir(t: TipoTarefaLms) {
    setEditando(t);
    setForm(paraForm(t));
  }

  function fechar() {
    setEditando(null);
    setForm(null);
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  async function salvar() {
    if (!editando || !form) return;
    const erro = validarFormTipo(form);
    if (erro) { toast.error(erro); return; }
    setSalvando(true);
    try {
      const r = await salvarTipoTarefaLms({
        tenantId,
        tipoTarefaId: editando.id,
        motivo: form.motivo.trim() || null,
        dados: {
          ativo: form.ativo,
          categoria: form.categoria || null,
          tipo_movimento: form.tipo_movimento ? Number(form.tipo_movimento) : null,
          unidade_medida: form.unidade_medida.trim() || null,
          peso_produtividade: Number(form.peso_produtividade),
          cor_interface: form.cor_interface || null,
          reserva_acao: form.reserva_acao,
          reserva_expira_min: form.reserva_acao === "NUNCA" ? editando.reserva_expira_min : Math.round(Number(form.reserva_horas) * 60),
        },
      });
      toast.success(r.alterou ? "Tipo de tarefa atualizado." : "Nada mudou.");
      fechar();
      await carregar();
    } catch (e) {
      toast.error(e instanceof LmsConfigErro ? e.message : "Não foi possível salvar o tipo de tarefa.");
    } finally {
      setSalvando(false);
    }
  }

  const padraoEditando = editando ? padraoPorTipo.get(editando.id) : undefined;
  const inputClass = "w-full h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <section className="rounded-lg border border-border bg-card" data-testid="lms-tipos-tarefa">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-2">
          <ListChecks size={18} className="mt-0.5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Tipos de tarefa</h2>
            <p className="text-xs text-muted-foreground">
              Cadastro de cada tipo de tarefa e o que fazer quando o operador fica com a tarefa sem atividade. Vale para todas as empresas.
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
                <th className="px-4 py-2 text-left font-medium">Tipo de tarefa</th>
                <th className="px-4 py-2 text-left font-medium">Categoria</th>
                <th className="px-4 py-2 text-left font-medium">Movimento</th>
                <th className="px-4 py-2 text-right font-medium">Tempo padrão · {nomeNivel}</th>
                <th className="px-4 py-2 text-left font-medium">Sem atividade</th>
                <th className="px-4 py-2 text-left font-medium">Situação</th>
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
                    <td className="px-4 py-2 text-right tabular-nums text-foreground">
                      {p && (p.efetivo.tempo_fixo_seg > 0 || Number(p.efetivo.tempo_unidade_seg ?? 0) > 0)
                        ? descreverPadrao(p.efetivo, p.unidade_medida) : <span className="text-muted-foreground">sem padrão</span>}
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
                      {podeEditar ? (
                        <Button size="sm" variant="ghost" aria-label={`Editar ${t.codigo}`} onClick={() => abrir(t)}><Pencil size={14} /></Button>
                      ) : (
                        <span title="Somente leitura" className="inline-flex text-muted-foreground"><Lock size={13} /></span>
                      )}
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

      {historico.length > 0 && (
        <details className="border-t border-border">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <History size={14} /> Alterações no cadastro
          </summary>
          <ul className="divide-y divide-border">
            {historico.map((h, i) => (
              <li key={`${h.tipo_tarefa_id}-${h.alterado_em}-${i}`} className="px-4 py-2 text-xs">
                <span className="font-mono text-foreground">{h.codigo}</span>{" "}
                <span className="text-muted-foreground">
                  {descreverMudancaTipo(h, reservaAcaoLabel)} · {h.alterado_por ?? "Sistema"} em {formatDateTime(h.alterado_em)}
                  {h.motivo ? ` · ${h.motivo}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Sheet open={!!editando} onOpenChange={(v) => !v && fechar()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>Editar tipo de tarefa</SheetTitle>
          </SheetHeader>
          {editando && form && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
              <div>
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cadastro</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                  <div className="flex items-center gap-3 md:col-span-2">
                    <Switch checked={form.ativo} onCheckedChange={(v) => set("ativo", v)} aria-label="Ativo" />
                    <span className="text-sm text-foreground">Ativo</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Produtividade</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm">
                      <Timer size={14} className="text-primary" />
                      Tempo padrão ({nomeNivel}):{" "}
                      <strong className="tabular-nums">
                        {padraoEditando && (padraoEditando.efetivo.tempo_fixo_seg > 0 || Number(padraoEditando.efetivo.tempo_unidade_seg ?? 0) > 0)
                          ? descreverPadrao(padraoEditando.efetivo, padraoEditando.unidade_medida) : "sem padrão"}
                      </strong>
                    </span>
                    {padraoEditando && (
                      <Button size="sm" variant="outline" onClick={() => { const p = padraoEditando; fechar(); onEditarPadrao(p); }}>
                        Alterar tempo padrão
                      </Button>
                    )}
                  </div>
                  <p className="md:col-span-2 -mt-2 text-xs text-muted-foreground">
                    Metas por hora agora são definidas em Produtividade (LMS) › Metas.
                  </p>
                  <label>
                    <span className={labelClass}>Unidade de medida</span>
                    <input className={inputClass} value={form.unidade_medida} maxLength={30} placeholder="Ex: caixas, pallets, SKUs"
                      onChange={(e) => set("unidade_medida", e.target.value)} />
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
                </div>
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Reserva sem atividade</h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                </div>
              </div>

              <label className="block border-t border-border pt-5">
                <span className={labelClass}>Motivo da alteração (opcional)</span>
                <input className={inputClass} value={form.motivo} maxLength={200} onChange={(e) => set("motivo", e.target.value)} />
              </label>
            </div>
          )}
          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <Button variant="outline" onClick={fechar} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  );
}
