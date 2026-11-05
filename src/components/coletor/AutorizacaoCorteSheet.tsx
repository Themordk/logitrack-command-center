import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ActionButton } from "@/components/coletor/ActionButton";
import { AlertTriangle, Eye, EyeOff, Scissors, ShieldCheck } from "lucide-react";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError, parseRpcResult } from "@/lib/errorMapper";

interface TarefaCorte {
  tarefa_id: string;
  sku?: string;
  produto?: string;
  endereco?: string;
  quantidade_requerida?: number;
  separado?: number;
}

interface MotivoCorte { id: string; descricao: string; exige_observacao?: boolean | null }

export interface ResultadoAutorizacaoCorte { autorizadorNome: string; dados: Record<string, unknown> }

interface AutorizacaoCorteSheetProps {
  open: boolean;
  tarefa: TarefaCorte | null;
  numeroOnda: string;
  temSaldoPulmao: boolean;
  onClose: () => void;
  onSuccess: (resultado: ResultadoAutorizacaoCorte) => void;
  onNavigate?: (path: string) => void;
}

const inputCls = "w-full h-12 bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl px-3 text-[16px] text-white focus:outline-none focus:border-[hsl(217,91%,50%)]";

function horaPtBr(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Fortaleza" });
}

export function AutorizacaoCorteSheet({ open, tarefa, numeroOnda, temSaldoPulmao, onClose, onSuccess, onNavigate }: AutorizacaoCorteSheetProps) {
  const [motivos, setMotivos] = useState<MotivoCorte[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [bloqueadoAte, setBloqueadoAte] = useState<number | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const senhaRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);
  const result = useResultDialog({ coletorMode: true });

  useEffect(() => () => setSenha(""), []);

  useEffect(() => {
    if (!open) { setSenha(""); setMostrarSenha(false); return; }
    setMotivoId(""); setObservacao(""); setLogin(""); setSenha("");
    (async () => {
      const { data, error } = await supabase
        .from("motivo_ocorrencia" as never)
        .select("id, descricao, exige_observacao")
        .eq("etapa_ocorrencia", "SEPARACAO")
        .eq("ativo", true)
        .eq("permite_corte", true);
      if (error) { result.showParsedError(parseError(error, "separacao-autorizacao-corte")); return; }
      setMotivos((data as unknown as MotivoCorte[]) || []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!bloqueadoAte) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= bloqueadoAte) setBloqueadoAte(null);
    }, 1000);
    return () => clearInterval(t);
  }, [bloqueadoAte]);

  if (!open || !tarefa) return <ResultDialog {...result.dialogProps} />;

  const pedido = Number(tarefa.quantidade_requerida ?? 0);
  const separado = Number(tarefa.separado ?? 0);
  const aCortar = Math.max(0, pedido - separado);
  const motivo = motivos.find((m) => m.id === motivoId);
  const exigeObs = !!motivo?.exige_observacao;
  const restanteSeg = bloqueadoAte ? Math.max(0, Math.ceil((bloqueadoAte - agora) / 1000)) : 0;
  const podeEnviar = !!motivoId && !!login.trim() && !!senha && (!exigeObs || !!observacao.trim()) && !bloqueadoAte;

  const fechar = () => { setSenha(""); onClose(); };

  const confirmar = async () => {
    if (!podeEnviar || enviandoRef.current) return;
    enviandoRef.current = true;
    setEnviando(true);
    let erro = false;
    try {
      const { data, error } = await supabase.functions.invoke("autorizar-corte", {
        body: {
          tarefa_id: tarefa.tarefa_id,
          motivo_ocorrencia_id: motivoId,
          observacao: observacao.trim() || null,
          quantidade: aCortar,
          login: login.trim(),
          senha,
        },
      });
      if (error) {
        erro = true;
        result.showParsedError(parseError(error, "separacao-autorizacao-corte"));
        return;
      }
      const r = parseRpcResult(data);
      const dados = ((r as unknown as { dados?: Record<string, unknown> }).dados) ?? {};
      if (r.sucesso) {
        setSenha("");
        onSuccess({ autorizadorNome: String(dados.autorizador_nome ?? ""), dados });
        return;
      }
      erro = true;
      if (r.codigo === "AUTORIZACAO_BLOQUEADA") {
        const ate = typeof dados.bloqueado_ate === "string" ? dados.bloqueado_ate : "";
        const ts = ate ? new Date(ate).getTime() : NaN;
        if (!isNaN(ts)) setBloqueadoAte(ts);
        result.showWarning("Muitas tentativas de autorização.", {
          instruction: ate ? `Tente novamente às ${horaPtBr(ate)}.` : "Aguarde alguns minutos e tente novamente.",
        });
      } else if (r.codigo === "CREDENCIAL_INVALIDA") {
        result.showError(r, { context: "separacao-autorizacao-corte", onClose: () => setTimeout(() => senhaRef.current?.focus(), 50) });
      } else if (r.codigo === "AUTORIZACAO_INVALIDA" || r.codigo === "TAREFA_JA_FINALIZADA") {
        result.showError(r, {
          context: "separacao-autorizacao-corte",
          onClose: () => { onClose(); onNavigate?.("/coletor/separacao/endereco"); },
        });
      } else {
        result.showError(r, { context: "separacao-autorizacao-corte" });
      }
    } catch (e: unknown) {
      erro = true;
      result.showParsedError(parseError(e, "separacao-autorizacao-corte"));
    } finally {
      if (erro) setSenha("");
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
        <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-5 space-y-4 animate-slide-up max-h-[96vh] overflow-y-auto">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-[hsl(217,91%,60%)]" /> Autorização de corte
          </h3>

          <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-3 space-y-1">
            <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Onda #{numeroOnda}</p>
            <p className="text-sm font-bold text-white">{tarefa.sku} - {tarefa.produto}</p>
            {tarefa.endereco && <p className="text-xs text-[hsl(213,31%,60%)] font-mono">{tarefa.endereco}</p>}
            <div className="grid grid-cols-3 gap-2 pt-2 text-center">
              <div><p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Pedido</p><p className="text-lg font-bold text-white">{pedido.toLocaleString("pt-BR")}</p></div>
              <div><p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Separado</p><p className="text-lg font-bold text-white">{separado.toLocaleString("pt-BR")}</p></div>
              <div><p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">A cortar</p><p className="text-lg font-bold text-red-400">{aCortar.toLocaleString("pt-BR")}</p></div>
            </div>
          </div>

          {temSaldoPulmao && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/40">
              <AlertTriangle size={16} className="text-[#F59E0B] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#FCD34D] leading-relaxed">Este produto ainda possui saldo em endereço de pulmão. Confirme antes de cortar.</p>
            </div>
          )}

          <div>
            <p className="text-[10px] uppercase text-[hsl(213,31%,45%)] mb-1">Motivo</p>
            <div className="flex flex-col gap-2 max-h-40 overflow-auto">
              {motivos.map((m) => (
                <button key={m.id} type="button" onClick={() => setMotivoId(m.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${motivoId === m.id ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]" : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"}`}>
                  <span className="text-sm text-white">{m.descricao}</span>
                </button>
              ))}
              {motivos.length === 0 && <p className="text-xs text-[hsl(213,31%,45%)] text-center py-3">Nenhum motivo de corte cadastrado para SEPARAÇÃO.</p>}
            </div>
          </div>

          <div>
            <label htmlFor="corte-obs" className="text-[10px] uppercase text-[hsl(213,31%,45%)] block mb-1">Observação ({exigeObs ? "obrigatória" : "opcional"})</label>
            <textarea id="corte-obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
              className="w-full bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 text-sm text-white focus:outline-none focus:border-[hsl(217,91%,50%)]"
              placeholder="Descreva o que aconteceu..." />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-[hsl(222,35%,22%)]" />
            <span className="text-[10px] uppercase tracking-wide text-[hsl(213,31%,55%)]">Supervisor</span>
            <div className="flex-1 h-px bg-[hsl(222,35%,22%)]" />
          </div>

          <div>
            <label htmlFor="corte-login" className="text-[10px] uppercase text-[hsl(213,31%,45%)] block mb-1">Login do supervisor</label>
            <input id="corte-login" type="text" value={login} onChange={(e) => setLogin(e.target.value)}
              autoComplete="off" autoCapitalize="none" spellCheck={false} className={inputCls} />
          </div>
          <div>
            <label htmlFor="corte-senha" className="text-[10px] uppercase text-[hsl(213,31%,45%)] block mb-1">Senha</label>
            <div className="relative">
              <input id="corte-senha" ref={senhaRef} type={mostrarSenha ? "text" : "password"} value={senha}
                onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" className={`${inputCls} pr-12`} />
              <button type="button" aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"} onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[hsl(213,31%,55%)]">
                {mostrarSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {bloqueadoAte && <p className="text-xs text-amber-300 text-center">Bloqueado. Tente novamente em {restanteSeg}s.</p>}

          <div className="flex gap-2">
            <ActionButton onClick={fechar} variant="secondary" disabled={enviando}>Cancelar</ActionButton>
            <ActionButton onClick={confirmar} variant="danger" disabled={!podeEnviar || enviando} loading={enviando}>
              <Scissors size={16} /> Autorizar e cortar
            </ActionButton>
          </div>
        </div>
      </div>
      <ResultDialog {...result.dialogProps} />
    </>
  );
}
