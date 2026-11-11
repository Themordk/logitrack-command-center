import { Loader2, MapPin, Package, Smartphone, UserCheck, UserCog, UserRound, AlertTriangle } from "lucide-react";
import type { ResumoEtapaColetor } from "@/lib/responsaveisOnda.types";

interface Props {
  resumo: ResumoEtapaColetor | null;
  loading: boolean;
}

/**
 * Painel do coletor com a situação da etapa da onda selecionada
 * (convocação híbrida). Só exibe o que o banco respondeu; não decide nada.
 */
export function ResumoEtapaPainel({ resumo, loading }: Props) {
  if (loading && !resumo) {
    return (
      <div className="shrink-0 flex items-center justify-center gap-2 p-3 rounded-2xl border border-[hsl(222,35%,22%)] text-xs text-[hsl(213,31%,55%)]">
        <Loader2 size={14} className="animate-spin" /> Consultando a onda...
      </div>
    );
  }
  if (!resumo?.sucesso) return null;

  const t = resumo.totais;
  let situacao: { icone: JSX.Element; texto: string; classe: string };
  if (resumo.ja_e_meu) {
    situacao = resumo.convocado_pelo_gestor
      ? { icone: <UserCog size={14} />, texto: "Convocada para você pelo gestor", classe: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" }
      : { icone: <UserCheck size={14} />, texto: "Com você", classe: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" };
  } else if (resumo.pode_assumir) {
    situacao = resumo.convocado_pelo_gestor
      ? { icone: <UserCog size={14} />, texto: "Convocada para você pelo gestor", classe: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" }
      : { icone: <UserRound size={14} />, texto: "Disponível — você pode assumir", classe: "text-blue-400 border-blue-500/40 bg-blue-500/10" };
  } else {
    situacao = {
      icone: <AlertTriangle size={14} />,
      texto: resumo.mensagem || "Indisponível para você",
      classe: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    };
  }

  return (
    <div className="shrink-0 flex flex-col gap-2 p-3 rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]" aria-live="polite">
      <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-sm font-medium ${situacao.classe}`}>
        {situacao.icone}
        <span>{situacao.texto}</span>
      </div>
      {t && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[hsl(222,35%,16%)] py-1.5">
            <p className="text-base font-bold text-white">{resumo.ja_e_meu ? t.minhas_tarefas : t.tarefas_livres}</p>
            <p className="text-[11px] text-[hsl(213,31%,55%)]">{resumo.ja_e_meu ? "suas tarefas" : "tarefas livres"}</p>
          </div>
          <div className="rounded-xl bg-[hsl(222,35%,16%)] py-1.5">
            <p className="text-base font-bold text-white flex items-center justify-center gap-1"><Package size={13} />{t.itens}</p>
            <p className="text-[11px] text-[hsl(213,31%,55%)]">itens</p>
          </div>
          <div className="rounded-xl bg-[hsl(222,35%,16%)] py-1.5">
            <p className="text-base font-bold text-white flex items-center justify-center gap-1"><MapPin size={13} />{t.enderecos}</p>
            <p className="text-[11px] text-[hsl(213,31%,55%)]">endereços</p>
          </div>
        </div>
      )}
      {resumo.operadores && resumo.operadores.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resumo.operadores.map((op) => (
            <span key={op.nome} className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[hsl(222,35%,18%)] text-[hsl(213,31%,80%)]">
              {op.origem === "GESTOR" ? <UserCog size={11} aria-label="convocado pelo gestor" /> : <Smartphone size={11} aria-label="assumiu pelo coletor" />}
              {op.nome} · {op.tarefas}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
