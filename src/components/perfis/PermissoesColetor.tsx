import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_ACAO_COLETOR, ehAcaoSensivel, permissoesDoModulo, rotuloModulo, type FluxoColetor } from "@/lib/perfisAcesso";
import type { Modulo, Permissao } from "@/lib/perfisAcessoService";
import { ContadorPermissoes } from "./ContadorPermissoes";

interface Props {
  grupos: { fluxo: FluxoColetor; modulos: Modulo[] }[];
  permissoes: Permissao[];
  selecionadas: Set<string>;
  somenteLeitura: boolean;
  onAlternar: (perm: Permissao, doModulo: Permissao[]) => void;
}

/** Permissões do coletor agrupadas por fluxo operacional (Entrada, Saída, Estoque…). */
export function PermissoesColetor({ grupos, permissoes, selecionadas, somenteLeitura, onAlternar }: Props) {
  return (
    <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
      {grupos.map(({ fluxo, modulos }) => {
        const linhas = modulos
          .map((m) => ({ modulo: m, perms: permissoesDoModulo(permissoes, m.id) }))
          .filter((l) => l.perms.length > 0);
        const todas = linhas.flatMap((l) => l.perms);
        const marcadas = todas.filter((p) => selecionadas.has(p.id)).length;
        return (
          <div key={fluxo} className="rounded-lg border border-border">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border">
              <span className="text-sm font-semibold text-foreground">{fluxo}</span>
              <ContadorPermissoes marcadas={marcadas} total={todas.length} />
            </div>
            <div className="divide-y divide-border/50">
              {linhas.map(({ modulo, perms }) => (
                <div key={modulo.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="text-xs text-foreground">{rotuloModulo(modulo)}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {perms.map((perm) => {
                      const ligado = selecionadas.has(perm.id);
                      const sensivel = ehAcaoSensivel(modulo, perm.acao);
                      return (
                        <button
                          key={perm.id}
                          onClick={() => onAlternar(perm, perms)}
                          disabled={somenteLeitura}
                          aria-pressed={ligado}
                          aria-label={`${ROTULO_ACAO_COLETOR[perm.acao]} — ${rotuloModulo(modulo)}${sensivel ? " (ação sensível)" : ""}`}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-[11px] border transition-colors",
                            ligado
                              ? "bg-primary/10 text-primary border-primary/30 font-semibold"
                              : "text-muted-foreground border-border hover:text-foreground",
                            ligado && sensivel && "bg-destructive/10 text-destructive border-destructive/30",
                            somenteLeitura && "cursor-default",
                          )}
                        >
                          {ligado ? <Check size={11} /> : <Plus size={11} />}
                          {ROTULO_ACAO_COLETOR[perm.acao]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
