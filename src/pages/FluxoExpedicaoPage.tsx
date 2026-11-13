/**
 * Fluxo de Expedição · F1 — configuração em cascata, do pedido ao veículo (substitui o Roteiro de Separação).
 * N0, N1 e N6 são fixos; o usuário decide N2 a N5 e grava tudo de uma vez (roteiro_saida_salvar).
 * Regras e validação ficam no backend; a tela só monta a escolha, explica e mostra os avisos.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDown, ArrowDownUp, ChevronDown, ChevronUp, ExternalLink, FileText, GitMerge, Info,
  Loader2, Lock, Route as RouteIcon, Save, Split, Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { OrdemPercursoPanel } from "@/components/fluxo/OrdemPercursoPanel";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONFIG_VAZIA, CRITERIO_AJUDA, CRITERIO_CURTO, CRITERIO_LABEL, NIVEL_INFO, alternarCriterio, configDeDados, configIgual,
  dicasNivel, fluxoExpedicaoService, fraseNivel, herdados, moverCriterio,
  type ConfigFluxo, type CriterioFluxo, type NivelFluxo, type RoteiroAviso,
} from "@/lib/fluxoExpedicao";

const MODULO = "web.config.fluxo-expedicao";

interface Props { onNavigate?: (path: string) => void }

interface TipoSaidaResumo {
  id: string; descricao: string; realiza_conferencia: boolean | null; conferencia_cega: boolean | null;
  conferencia_checkout: boolean | null; gera_volume_etapa: string | null; realiza_embarque: boolean | null;
  reserva_separacao_movimento: boolean | null; reserva_conferencia_movimento: boolean | null;
}

const ETAPA_FIM = (t: TipoSaidaResumo) => (t.realiza_embarque ? "Embarque" : t.realiza_conferencia ? "Conferência" : "Separação");

const Conector = () => (
  <div className="flex justify-center py-1" aria-hidden="true"><ArrowDown size={16} className="text-muted-foreground/60" /></div>
);

function CabecalhoNivel({ codigo, titulo, descricao, fixo }: { codigo: string; titulo: string; descricao: string; fixo?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold border ${
        fixo ? "bg-secondary text-muted-foreground border-border" : "bg-primary/10 text-primary border-primary/30"}`}>{codigo}</span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {titulo}{fixo && <Lock size={12} className="text-muted-foreground" aria-label="Nível fixo" />}
        </h2>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
    </div>
  );
}

interface NivelProps {
  nivel: NivelFluxo;
  config: ConfigFluxo;
  permitidos: CriterioFluxo[];
  podeEditar: boolean;
  onChange: (lista: CriterioFluxo[]) => void;
  children?: React.ReactNode;
}

function BlocoNivel({ nivel, config, permitidos, podeEditar, onChange, children }: NivelProps) {
  const info = NIVEL_INFO[nivel];
  const selecionados = config[nivel];
  const [segregar, setSegregar] = useState(selecionados.length > 0);
  useEffect(() => { if (selecionados.length > 0) setSegregar(true); }, [selecionados.length]);
  const her = nivel === "separacao" || nivel === "conferencia" ? herdados(config) : [];
  const ordenados = [...selecionados, ...permitidos.filter((c) => !selecionados.includes(c))];
  const dicas = dicasNivel(nivel, config);

  const escolherModo = (s: boolean) => {
    setSegregar(s);
    if (!s && selecionados.length) onChange([]);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-labelledby={`nivel-${nivel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div id={`nivel-${nivel}`}><CabecalhoNivel codigo={info.codigo} titulo={info.titulo} descricao={info.nasce} /></div>
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-background" role="radiogroup" aria-label={`Modo do nível ${info.titulo}`}>
          {([[false, "Unificar", GitMerge], [true, "Segregar", Split]] as const).map(([valor, rotulo, Icone]) => (
            <button key={rotulo} type="button" role="radio" aria-checked={segregar === valor} disabled={!podeEditar}
              onClick={() => escolherModo(valor)}
              className={`flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                segregar === valor ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Icone size={13} aria-hidden="true" /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {her.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {her.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-secondary text-[11px] text-muted-foreground"
              title="Vem do nível Movimento: já está separado aqui e não pode ser desmarcado">
              <Lock size={10} aria-hidden="true" /> {CRITERIO_LABEL[c]} · herdado de N2
            </span>
          ))}
        </div>
      )}

      {segregar ? (
        <div className="space-y-1">
          <p className="text-[11px] text-muted-foreground">Marque os critérios; a ordem define a hierarquia da quebra.</p>
          {ordenados.map((c) => {
            const idx = selecionados.indexOf(c);
            const marcado = idx >= 0;
            return (
              <div key={c} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                marcado ? "bg-primary/5 border-primary/20" : "border-transparent hover:bg-secondary/40"}`}>
                <Checkbox id={`crit-${nivel}-${c}`} checked={marcado} disabled={!podeEditar}
                  onCheckedChange={() => onChange(alternarCriterio(selecionados, c))} />
                <label htmlFor={`crit-${nivel}-${c}`} className="flex-1 min-w-0 cursor-pointer">
                  <span className="block text-sm text-foreground">{CRITERIO_LABEL[c]}</span>
                  {CRITERIO_AJUDA[c] && <span className="block text-[11px] text-muted-foreground">{CRITERIO_AJUDA[c]}</span>}
                </label>
                {marcado && (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center" aria-label={`Ordem ${idx + 1}`}>{idx + 1}</span>
                    <button type="button" disabled={!podeEditar || idx === 0} onClick={() => onChange(moverCriterio(selecionados, idx, -1))}
                      className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 flex items-center justify-center"
                      aria-label={`Subir ${CRITERIO_CURTO[c]}`}><ChevronUp size={14} /></button>
                    <button type="button" disabled={!podeEditar || idx === selecionados.length - 1} onClick={() => onChange(moverCriterio(selecionados, idx, 1))}
                      className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30 flex items-center justify-center"
                      aria-label={`Descer ${CRITERIO_CURTO[c]}`}><ChevronDown size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
          {selecionados.length === 0 && (
            <p className="text-[11px] text-amber-400 px-1">Nenhum critério marcado: o nível continua unificado.</p>
          )}
        </div>
      ) : null}

      {children}

      {dicas.map((d) => (
        <p key={d} className="flex items-start gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" /> {d}
        </p>
      ))}
      <p className="flex items-start gap-2 text-xs text-foreground bg-secondary/50 rounded-md px-3 py-2">
        <Info size={13} className="shrink-0 mt-0.5 text-primary" aria-hidden="true" /> {fraseNivel(nivel, config)}
      </p>
    </section>
  );
}

export function FluxoExpedicaoPage({ onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const { can } = usePermissions();
  const podeEditar = can(MODULO, "UPDATE");
  const qc = useQueryClient();
  const pronto = !!tenantId && !!empresaId;

  const roteiro = useQuery({
    queryKey: ["fluxo-expedicao", tenantId, empresaId, empresaVersion],
    enabled: pronto,
    queryFn: () => fluxoExpedicaoService.obter(tenantId as string, empresaId as string),
  });
  const empresa = useQuery({
    queryKey: ["empresa-nome", empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from("empresa").select("razaosocial, codigo").eq("id", empresaId as string).maybeSingle();
      return data as { razaosocial: string; codigo: string | null } | null;
    },
  });
  const tipos = useQuery({
    queryKey: ["fluxo-tipos-saida", tenantId, empresaId],
    enabled: pronto,
    queryFn: async () => {
      // tipo_saida: leitura direta com RLS, como na tela Tipos de Saída
      const { data, error } = await supabase.from("tipo_saida")
        .select("id, descricao, realiza_conferencia, conferencia_cega, conferencia_checkout, gera_volume_etapa, realiza_embarque, reserva_separacao_movimento, reserva_conferencia_movimento")
        .eq("tenant_id", tenantId as string).eq("ativo", true)
        .or(`empresa_id.eq.${empresaId},empresa_id.is.null`).order("descricao");
      if (error) throw error;
      return (data ?? []) as unknown as TipoSaidaResumo[];
    },
  });

  const original = useMemo(() => (roteiro.data ? configDeDados(roteiro.data) : CONFIG_VAZIA), [roteiro.data]);
  const [config, setConfig] = useState<ConfigFluxo>(CONFIG_VAZIA);
  const [chave, setChave] = useState(0);
  const [avisos, setAvisos] = useState<RoteiroAviso[]>([]);
  const [percursoAberto, setPercursoAberto] = useState(false);
  useEffect(() => { setConfig(original); setChave((k) => k + 1); }, [original]);
  const alterado = !configIgual(config, original);
  const permitidos = roteiro.data?.criterios_permitidos;

  const mudar = (nivel: NivelFluxo) => (lista: CriterioFluxo[]) => setConfig((c) => ({ ...c, [nivel]: lista }));

  const salvar = useMutation({
    mutationFn: () => fluxoExpedicaoService.salvar(tenantId as string, empresaId as string, config),
    onSuccess: (r) => {
      setAvisos(r.avisos);
      qc.setQueryData(["fluxo-expedicao", tenantId, empresaId, empresaVersion], r.dados);
      toast.success("Fluxo de Expedição salvo.", { description: "Vale para os próximos movimentos gerados e liberados." });
      if (r.avisos.length) toast.warning(`${r.avisos.length} aviso(s) sobre a configuração.`);
    },
    onError: (e) => {
      const p = parseError(e, "fluxo-expedicao");
      toast.error(p.title, { description: p.instruction || p.details });
    },
  });

  if (!pronto || roteiro.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }
  if (roteiro.isError || !permitidos) {
    return (
      <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
        {parseError(roteiro.error, "fluxo-expedicao").title}
      </div>
    );
  }

  const maxSkuInvalido = config.maxSku !== null && (!Number.isInteger(config.maxSku) || config.maxSku <= 0);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-foreground">Fluxo de Expedição</h1>
          <p className="text-xs text-muted-foreground">
            Configure como os pedidos viram ondas, separação, conferência e cargas, do movimento de saída ao embarque no veículo.
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Empresa: <span className="text-foreground font-medium">{empresa.data?.razaosocial ?? "—"}</span> · a configuração é por empresa (troque no topo da tela).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {alterado && <span className="text-[11px] px-2 py-1 rounded-full border border-amber-500/40 text-amber-400">Alterações não salvas</span>}
          <button type="button" onClick={() => { setConfig(original); setChave((k) => k + 1); }} disabled={!alterado || salvar.isPending}
            className="h-9 px-3 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40 flex items-center gap-1.5">
            <Undo2 size={14} /> Descartar
          </button>
          <button type="button" onClick={() => salvar.mutate()} disabled={!podeEditar || !alterado || maxSkuInvalido || salvar.isPending}
            title={!podeEditar ? "Sem permissão para alterar" : undefined}
            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5">
            {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar fluxo
          </button>
        </div>
      </div>

      {!podeEditar && (
        <p className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2">Você pode consultar o fluxo, mas não tem permissão para alterá-lo.</p>
      )}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 space-y-1" role="status">
          <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5"><AlertTriangle size={13} /> Avisos do último salvamento</p>
          {avisos.map((a) => <p key={a.codigo} className="text-xs text-amber-200">{a.mensagem}</p>)}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">
        {/* Cascata */}
        <div key={chave}>
          <section className="rounded-lg border border-border bg-card/60 p-4">
            <CabecalhoNivel codigo="N0" titulo="Documentos" descricao="Pedidos de saída recebidos do ERP e liberados para o WMS." fixo />
          </section>
          <Conector />
          <section className="rounded-lg border border-border bg-card/60 p-4 space-y-2">
            <CabecalhoNivel codigo="N1" titulo="Quebras fixas" descricao="Sempre geram movimentos separados; não podem ser desligadas." fixo />
            <div className="flex flex-wrap gap-1.5 pl-12">
              {["Empresa", "Tipo de saída"].map((q) => (
                <span key={q} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-secondary text-[11px] text-muted-foreground">
                  <Lock size={10} aria-hidden="true" /> {q}
                </span>
              ))}
              <span className="text-[11px] text-muted-foreground self-center">· Armazém não quebra o movimento: quebra os grupos de separação.</span>
            </div>
          </section>
          <Conector />
          <BlocoNivel nivel="movimento" config={config} permitidos={permitidos.movimento} podeEditar={podeEditar} onChange={mudar("movimento")} />
          <Conector />
          <BlocoNivel nivel="separacao" config={config} permitidos={permitidos.separacao} podeEditar={podeEditar} onChange={mudar("separacao")}>
            <div className="flex flex-wrap items-end gap-3 pt-1">
              <div className="flex flex-col gap-1">
                <label htmlFor="max-sku" className="text-[11px] font-medium text-muted-foreground uppercase">Máximo de SKUs por grupo</label>
                <input id="max-sku" type="number" min={1} step={1} inputMode="numeric" placeholder="Sem limite" disabled={!podeEditar}
                  value={config.maxSku ?? ""}
                  onChange={(e) => setConfig((c) => ({ ...c, maxSku: e.target.value === "" ? null : Number(e.target.value) }))}
                  className={`h-9 w-36 px-3 rounded-lg border bg-background text-sm text-foreground outline-none focus:border-primary ${maxSkuInvalido ? "border-red-500" : "border-border"}`} />
              </div>
              <p className="text-[11px] text-muted-foreground pb-2 max-w-md">O limite rompe, não agrupa: passou do máximo, abre outro grupo com o mesmo critério.</p>
            </div>
            <div className="pt-1">
              <button type="button" onClick={() => setPercursoAberto((v) => !v)} aria-expanded={percursoAberto}
                className="flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary">
                <ArrowDownUp size={13} /> N3.1 · Ordem de percurso das ruas {percursoAberto ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span className="font-normal text-muted-foreground">(grava na hora)</span>
              </button>
              {percursoAberto && (
                <div className="mt-2">
                  <OrdemPercursoPanel tenantId={tenantId as string} empresaId={empresaId as string} podeEditar={podeEditar} versao={empresaVersion} />
                </div>
              )}
            </div>
          </BlocoNivel>
          <Conector />
          <BlocoNivel nivel="conferencia" config={config} permitidos={permitidos.conferencia} podeEditar={podeEditar} onChange={mudar("conferencia")} />
          <Conector />
          <BlocoNivel nivel="embarque" config={config} permitidos={permitidos.embarque} podeEditar={podeEditar} onChange={mudar("embarque")}>
            <p className="flex items-start gap-2 text-xs text-muted-foreground px-1">
              <RouteIcon size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
              A carga é montada pelo supervisor na Montagem de Carga e o operador bipa os volumes no coletor; pedidos sem volume geram os volumes no próprio embarque.
              Confirmação do veículo, reserva da carga e liberação automática são configuradas no tipo de saída.
            </p>
          </BlocoNivel>
          <Conector />
          <section className="rounded-lg border border-border bg-card/60 p-4">
            <CabecalhoNivel codigo="N6" titulo="Tarefa" descricao="Unidade atômica: produto × endereço na separação e na conferência; volume na carga no embarque." fixo />
          </section>
        </div>

        {/* Lateral: resumo e tipos de saída */}
        <aside className="space-y-4 xl:sticky xl:top-4">
          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><FileText size={14} /> Como fica</h2>
            <ol className="space-y-2">
              {(["movimento", "separacao", "conferencia", "embarque"] as const).map((n) => (
                <li key={n} className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{NIVEL_INFO[n].codigo} · {NIVEL_INFO[n].titulo}.</span> {fraseNivel(n, config)}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">
              A simulação com pedidos reais (quantos movimentos, grupos e cargas) entra na próxima fase.
            </p>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">Tipos de saída</h2>
              {onNavigate && (
                <button type="button" onClick={() => onNavigate("/dados-mestres/tipos-saida")}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1">Editar <ExternalLink size={11} /></button>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">Cada tipo decide quais etapas a onda percorre. Somente leitura aqui.</p>
            {tipos.isLoading ? (
              <div className="flex justify-center py-3"><Loader2 size={14} className="animate-spin text-muted-foreground" /></div>
            ) : (tipos.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum tipo de saída ativo.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {(tipos.data ?? []).map((t) => (
                  <li key={t.id} className="py-2">
                    <p className="text-xs font-medium text-foreground">{t.descricao}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Conferência: {t.realiza_conferencia ? [ "sim", t.conferencia_cega && "cega", t.conferencia_checkout && "checkout"].filter(Boolean).join(", ") : "não"}
                      {" · "}Volume: {(t.gera_volume_etapa ?? "NENHUMA").toLowerCase()}
                      {" · "}Embarque: {t.realiza_embarque ? "sim" : "não"}
                      {" · "}Conclui em: {ETAPA_FIM(t)}
                    </p>
                    {(t.reserva_separacao_movimento || t.reserva_conferencia_movimento) && (
                      <p className="text-[11px] text-muted-foreground">
                        Reserva o movimento inteiro na {[t.reserva_separacao_movimento && "separação", t.reserva_conferencia_movimento && "conferência"].filter(Boolean).join(" e ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
