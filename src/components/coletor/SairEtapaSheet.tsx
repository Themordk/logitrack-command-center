/**
 * Fase 5.3 · "Sair da etapa" (coletor) — mesma tela para separação, conferência,
 * recebimento, armazenagem, inventário e embarque. A prévia e a regra vêm de
 * rpc_coletor_sair_etapa via sairEtapaService; aqui só a escolha do operador.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Hand, Loader2, LogOut, PackageOpen, X } from "lucide-react";
import { ActionButton } from "./ActionButton";
import {
  MOTIVOS_SAIR, modoPadrao, opcoesSair, pedirLiberacao, sairEtapa, simularSairEtapa,
  type ModoSair, type MotivoSair, type ParamsSair, type ResultadoSair,
} from "@/lib/sairEtapaService";
import { parseError } from "@/lib/errorMapper";

interface Props {
  open: boolean;
  params: ParamsSair | null;
  onClose: () => void;
  /** Chamado depois de devolver tarefas (a tela recarrega a lista / volta). */
  onSaiu: (r: ResultadoSair) => void;
  /** Prévia já consultada (useSairEtapaColetor): evita perguntar ao banco de novo. */
  previaInicial?: ResultadoSair | null;
}

export function SairEtapaSheet({ open, params, onClose, onSaiu, previaInicial }: Props) {
  const [previa, setPrevia] = useState<ResultadoSair | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [modo, setModo] = useState<ModoSair>("NAO_INICIADAS");
  const [motivo, setMotivo] = useState<MotivoSair | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !params) return;
    setPrevia(null); setErro(null); setAviso(null); setMotivo(null);
    if (previaInicial) { setPrevia(previaInicial); setModo(modoPadrao(previaInicial.resumo)); return; }
    setCarregando(true);
    simularSairEtapa(params)
      .then((r) => { setPrevia(r); setModo(modoPadrao(r.resumo)); })
      .catch((e) => setErro(parseError(e, "sair-etapa").title))
      .finally(() => setCarregando(false));
  }, [open, params, previaInicial]);

  if (!open || !params) return null;

  const designada = previa?.codigo === "ATRIBUICAO_DO_GESTOR";
  const resumo = previa?.resumo;
  const opcoes = opcoesSair(resumo);
  const escolhida = opcoes.find((o) => o.modo === modo);

  const confirmar = async () => {
    setEnviando(true); setErro(null);
    try {
      const r = await sairEtapa(params, modo, motivo);
      if (!r.sucesso) { setErro(r.mensagem || "Não foi possível sair da etapa."); return; }
      onSaiu(r);
    } catch (e) {
      setErro(parseError(e, "sair-etapa").title);
    } finally {
      setEnviando(false);
    }
  };

  const pedir = async () => {
    setEnviando(true); setErro(null);
    try {
      const r = await pedirLiberacao(params, motivo);
      if (!r.sucesso) { setErro(r.mensagem || "Não foi possível enviar o pedido."); return; }
      setAviso(r.mensagem || "Pedido enviado ao gestor.");
    } catch (e) {
      setErro(parseError(e, "sair-etapa").title);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Sair da etapa">
      <div className="absolute inset-0 bg-black/70" onClick={() => !enviando && onClose()} />
      <div className="relative w-full rounded-t-3xl bg-[hsl(222,40%,12%)] border-t border-[hsl(222,35%,22%)] p-4 flex flex-col gap-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2"><LogOut size={18} /> Sair da etapa</h2>
          <button type="button" onClick={onClose} disabled={enviando} aria-label="Fechar"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[hsl(213,31%,55%)]">
            <X size={20} />
          </button>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-8"><Loader2 size={24} className="animate-spin text-[hsl(213,31%,70%)]" /></div>
        ) : aviso ? (
          <div className="rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 p-3 text-sm text-green-200 flex items-start gap-2">
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> {aviso}
          </div>
        ) : designada ? (
          <>
            <div className="rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 p-3 text-sm text-amber-200 flex items-start gap-2">
              <Hand size={18} className="shrink-0 mt-0.5" />
              <span>{previa?.mensagem} Você pode pedir a liberação: o gestor recebe o aviso no painel.</span>
            </div>
            <MotivoChips motivo={motivo} onChange={setMotivo} />
          </>
        ) : resumo ? (
          <>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Contador valor={resumo.nao_iniciadas} rotulo="não iniciadas" />
              <Contador valor={resumo.em_execucao} rotulo="em execução" destaque={resumo.em_execucao > 0} />
              <Contador valor={resumo.com_progresso} rotulo="com progresso" destaque={resumo.com_progresso > 0} />
            </div>
            {resumo.produto_em_maos > 0 && (
              <div className="rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/40 p-3 text-xs text-amber-200 flex items-start gap-2">
                <PackageOpen size={16} className="shrink-0" />
                {resumo.produto_em_maos} tarefa(s) com coleta parcial ficam com você até a entrega do produto. O supervisor é avisado.
              </div>
            )}
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="O que devolver">
              {opcoes.map((o) => (
                <button key={o.modo} type="button" role="radio" aria-checked={modo === o.modo} disabled={!o.disponivel}
                  onClick={() => setModo(o.modo)}
                  className={`min-h-[56px] rounded-xl border px-3 py-2 text-left disabled:opacity-40 ${
                    modo === o.modo ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/15" : "border-[hsl(222,35%,25%)] bg-[hsl(222,40%,10%)]"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white">{o.rotulo}</span>
                    <span className="text-sm font-mono text-white">{o.quantidade}</span>
                  </div>
                  <span className="text-xs text-[hsl(213,31%,60%)]">{o.detalhe}</span>
                </button>
              ))}
            </div>
            {modo === "TODAS" && resumo.em_execucao > 0 && (
              <p className="text-xs text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                Se der, conclua a parcial antes de sair: o tempo da tarefa interrompida não conta como produção.
              </p>
            )}
            <MotivoChips motivo={motivo} onChange={setMotivo} />
          </>
        ) : null}

        {erro && <p className="text-sm text-red-300" role="alert">{erro}</p>}

        {!carregando && !aviso && (
          designada ? (
            <ActionButton variant="warning" onClick={pedir} loading={enviando}>Pedir liberação ao gestor</ActionButton>
          ) : (
            <ActionButton variant="danger" onClick={confirmar} loading={enviando} disabled={!escolhida?.disponivel}>
              {escolhida ? `Devolver ${escolhida.quantidade} tarefa(s)` : "Sair da etapa"}
            </ActionButton>
          )
        )}
        <ActionButton variant="secondary" onClick={onClose} disabled={enviando}>{aviso ? "Fechar" : "Continuar trabalhando"}</ActionButton>
      </div>
    </div>
  );
}

function Contador({ valor, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl p-2 border ${destaque ? "border-[#F59E0B]/50 bg-[#F59E0B]/10" : "border-[hsl(222,35%,25%)] bg-[hsl(222,40%,10%)]"}`}>
      <div className="text-xl font-bold font-mono text-white">{valor}</div>
      <div className="text-[11px] text-[hsl(213,31%,60%)]">{rotulo}</div>
    </div>
  );
}

function MotivoChips({ motivo, onChange }: { motivo: MotivoSair | null; onChange: (m: MotivoSair | null) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-[hsl(213,31%,55%)]">Motivo (opcional)</span>
      <div className="flex flex-wrap gap-2">
        {MOTIVOS_SAIR.map((m) => (
          <button key={m.valor} type="button" aria-pressed={motivo === m.valor}
            onClick={() => onChange(motivo === m.valor ? null : m.valor)}
            className={`min-h-[44px] px-3 rounded-full text-xs border ${
              motivo === m.valor ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/20 text-white" : "border-[hsl(222,35%,25%)] text-[hsl(213,31%,75%)]"}`}>
            {m.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botão de cabeçalho (ícone) que abre a folha. Use no titleBadge do ColetorLayout. */
export function SairEtapaBotaoCabecalho({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label="Sair da etapa" title="Sair da etapa"
      className="ml-1 h-9 px-2.5 rounded-lg bg-white/15 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-40">
      <LogOut size={14} /> Sair
    </button>
  );
}

/**
 * Botão "Sair" do cabeçalho + folha, para as telas de execução (recebimento,
 * armazenagem, inventário, embarque). Some quando falta contexto ou está offline.
 */
export function SairEtapaCabecalho({ params, online = true, onSaiu }: {
  params: ParamsSair | null; online?: boolean; onSaiu: (r: ResultadoSair) => void;
}) {
  const [aberto, setAberto] = useState(false);
  if (!params || !params.contextoId || !params.tenantId || !params.usuarioId) return null;
  return (
    <>
      <SairEtapaBotaoCabecalho onClick={() => setAberto(true)} disabled={!online} />
      <SairEtapaSheet open={aberto} params={params} onClose={() => setAberto(false)}
        onSaiu={(r) => { setAberto(false); onSaiu(r); }} />
    </>
  );
}
