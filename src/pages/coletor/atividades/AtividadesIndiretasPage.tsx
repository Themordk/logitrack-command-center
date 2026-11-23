import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Coffee, Loader2, PauseCircle, RefreshCw } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { AtividadeEmAndamentoBanner } from "./AtividadeEmAndamentoBanner";
import {
  encerrarIndireto, formatarDecorrido, iniciarIndireto, obterEstadoIndireto,
  type AtividadeColetor, type EstadoIndireto, type TipoAtividadeColetor,
} from "./atividadesIndiretas.service";

interface Props { onNavigate: (path: string) => void }

const GRUPOS: Array<{ tipo: TipoAtividadeColetor; titulo: string; dica: string }> = [
  { tipo: "INDIRETA", titulo: "Trabalho sem tarefa", dica: "Conta como trabalho, não como tempo ocioso." },
  { tipo: "EXCECAO", titulo: "Parada (não conta contra você)", dica: "Use quando não dá para trabalhar por um motivo fora do seu controle." },
];

export function AtividadesIndiretasPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const [estado, setEstado] = useState<EstadoIndireto | null>(null);
  const [recebidoEm, setRecebidoEm] = useState(Date.now());
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [acao, setAcao] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!tenantId) { setErro("Não foi possível identificar a sessão."); setCarregando(false); return; }
    setCarregando(true);
    setErro(null);
    try {
      setEstado(await obterEstadoIndireto(tenantId));
      setRecebidoEm(Date.now());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function iniciar(a: AtividadeColetor) {
    if (!tenantId || acao) return;
    setAcao(a.id);
    try {
      const r = await iniciarIndireto(tenantId, a.id, armazemId);
      toast.success(r.mensagem);
      onNavigate("/coletor/home");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível iniciar.");
      setAcao(null);
    }
  }

  async function encerrar() {
    if (!tenantId || acao) return;
    setAcao("encerrar");
    try {
      const r = await encerrarIndireto(tenantId);
      toast.success(r.mensagem);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível encerrar.");
    } finally {
      setAcao(null);
    }
  }

  return (
    <ColetorLayout title="Atividade sem tarefa" onNavigate={onNavigate} showBack backPath="/coletor/home">
      {carregando && !estado ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 size={32} className="animate-spin text-blue-400" /></div>
      ) : erro ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="max-w-xs text-sm text-[hsl(213,31%,55%)]">{erro}</p>
          <button type="button" onClick={carregar} className="flex h-12 items-center gap-2 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] px-4 text-sm text-white">
            <RefreshCw size={16} /> Tentar novamente
          </button>
        </div>
      ) : estado && (
        <div className="flex-1 min-h-0 space-y-3 overflow-y-auto pb-2">
          {estado.aberto && (
            <AtividadeEmAndamentoBanner aberto={estado.aberto} recebidoEm={recebidoEm} encerrando={acao === "encerrar"} onEncerrar={encerrar} />
          )}
          <p className="text-xs text-[hsl(213,31%,60%)]">
            {estado.aberto
              ? "Para trocar, toque em outra atividade: a atual é encerrada na hora."
              : "Toque no que você vai fazer agora. Ao voltar para uma tarefa, encerre na tela inicial."}
          </p>

          {GRUPOS.map((g) => {
            const itens = estado.atividades.filter((a) => a.tipo === g.tipo);
            if (itens.length === 0) return null;
            return (
              <section key={g.tipo} className="space-y-1.5">
                <div>
                  <p className="text-sm font-bold text-white">{g.titulo}</p>
                  <p className="text-[11px] text-[hsl(213,31%,55%)]">{g.dica}</p>
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {itens.map((a) => {
                    const atual = estado.aberto?.atividade_id === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        disabled={!!acao || atual}
                        onClick={() => iniciar(a)}
                        className={`flex min-h-[52px] items-center gap-3 rounded-xl border px-3 text-left active:scale-[0.98] disabled:opacity-60 ${atual
                          ? "border-blue-500 bg-blue-500/15"
                          : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]"}`}
                      >
                        {g.tipo === "EXCECAO"
                          ? <PauseCircle size={20} className="shrink-0 text-amber-400" />
                          : <Coffee size={20} className="shrink-0 text-cyan-400" />}
                        <span className="flex-1 text-sm font-semibold text-white">{a.nome}</span>
                        {acao === a.id ? <Loader2 size={16} className="animate-spin text-white" />
                          : atual ? <span className="text-[11px] font-semibold text-blue-300">em andamento</span> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {estado.atividades.length === 0 && (
            <p className="text-center text-sm text-[hsl(213,31%,55%)]">Nenhuma atividade cadastrada. Fale com o gerente.</p>
          )}

          {estado.hoje.apontamentos > 0 && (
            <p className="text-center text-[11px] text-[hsl(213,31%,55%)]">
              Hoje: {formatarDecorrido(estado.hoje.indireta_seg)} em atividades sem tarefa
              {estado.hoje.excecao_seg > 0 ? ` · ${formatarDecorrido(estado.hoje.excecao_seg)} parado` : ""}
            </p>
          )}
        </div>
      )}
    </ColetorLayout>
  );
}
