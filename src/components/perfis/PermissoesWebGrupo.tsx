import { AlertTriangle, ChevronDown, ChevronRight, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { GrupoWeb } from "@/lib/perfisAcesso";
import { ORDEM_ACOES, ROTULO_ACAO_WEB, ehAcaoSensivel, permissoesDoModulo } from "@/lib/perfisAcesso";
import type { Acao, Permissao } from "@/lib/perfisAcessoService";
import { ContadorPermissoes } from "./ContadorPermissoes";

interface Props {
  item: GrupoWeb;
  permissoes: Permissao[];
  selecionadas: Set<string>;
  visivel: boolean;
  expandido: boolean;
  somenteLeitura: boolean;
  /** Perfil de acesso total: menu sempre visível. */
  menuTravado: boolean;
  onExpandir: () => void;
  onAlternar: (perm: Permissao, doModulo: Permissao[]) => void;
  onDefinir: (ids: string[], ligar: boolean) => void;
  onVisibilidade: (visivel: boolean) => void;
}

export function PermissoesWebGrupo({
  item, permissoes, selecionadas, visivel, expandido, somenteLeitura, menuTravado,
  onExpandir, onAlternar, onDefinir, onVisibilidade,
}: Props) {
  const { grupo, modulos } = item;
  const Icone = grupo.icon;
  const linhas = modulos
    .map((m) => ({ modulo: m, perms: permissoesDoModulo(permissoes, m.id) }))
    .filter((l) => l.perms.length > 0);
  const todas = linhas.flatMap((l) => l.perms);
  const marcadas = todas.filter((p) => selecionadas.has(p.id)).length;
  const colunas = ORDEM_ACOES.filter((a) => todas.some((p) => p.acao === a));
  const ehGrupoDoMenu = grupo.id !== "__outros";

  const idsDaColuna = (acao: Acao) => todas.filter((p) => p.acao === acao).map((p) => p.id);
  const colunaCheia = (acao: Acao) => idsDaColuna(acao).every((id) => selecionadas.has(id));

  const alternarColuna = (acao: Acao) => {
    const ligar = !colunaCheia(acao);
    const ids = idsDaColuna(acao);
    // Ligar uma coluna que não é Visualizar liga Visualizar das mesmas telas.
    if (ligar && acao !== "READ") {
      for (const l of linhas) {
        if (l.perms.some((p) => p.acao === acao)) {
          const read = l.perms.find((p) => p.acao === "READ");
          if (read) ids.push(read.id);
        }
      }
    }
    // Desligar Visualizar limpa as telas inteiras.
    onDefinir(acao === "READ" && !ligar ? todas.map((p) => p.id) : ids, ligar);
  };

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
        <button
          onClick={onExpandir}
          aria-expanded={expandido}
          className={cn("flex flex-1 min-w-[200px] items-center gap-2 text-left", !visivel && "opacity-60")}
        >
          {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Icone size={14} className="text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{grupo.label}</span>
          <ContadorPermissoes marcadas={marcadas} total={todas.length} />
        </button>

        {!visivel && (
          <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-500">
            <EyeOff size={12} /> Oculto no menu · permissões preservadas
          </span>
        )}

        {!somenteLeitura && todas.length > 0 && (
          <button
            onClick={() => onDefinir(todas.map((p) => p.id), marcadas < todas.length)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {marcadas < todas.length ? "Marcar tudo" : "Desmarcar tudo"}
          </button>
        )}

        {ehGrupoDoMenu && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Exibir no menu
            <Switch
              checked={visivel}
              onCheckedChange={onVisibilidade}
              disabled={somenteLeitura || menuTravado}
              aria-label={`Exibir o menu ${grupo.label} no TopNav`}
            />
          </label>
        )}
      </div>

      {expandido && (
        <div className={cn("border-t border-border overflow-x-auto", !visivel && "opacity-60")}>
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left font-medium px-3 py-2">Tela</th>
                {colunas.map((acao) => (
                  <th key={acao} className="font-medium px-2 py-2 w-[88px]">
                    <button
                      onClick={() => !somenteLeitura && alternarColuna(acao)}
                      disabled={somenteLeitura}
                      title={somenteLeitura ? undefined : `Marcar/desmarcar ${ROTULO_ACAO_WEB[acao]} em todas as telas`}
                      className={cn(
                        "inline-flex items-center gap-1",
                        !somenteLeitura && "hover:text-foreground",
                        acao === "DELETE" && "text-destructive/80",
                      )}
                    >
                      {ROTULO_ACAO_WEB[acao]}
                      {acao === "DELETE" && <AlertTriangle size={11} aria-label="Ação sensível" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ modulo, perms }) => (
                <tr key={modulo.id} className="border-t border-border/50 table-row-hover">
                  <td className="px-3 py-2 text-foreground">{modulo.descricao}</td>
                  {colunas.map((acao) => {
                    const perm = perms.find((p) => p.acao === acao);
                    if (!perm) {
                      return <td key={acao} className="text-center text-muted-foreground/40" aria-label="Não se aplica">—</td>;
                    }
                    const sensivel = ehAcaoSensivel(modulo, acao);
                    return (
                      <td key={acao} className="text-center py-2">
                        <input
                          type="checkbox"
                          checked={selecionadas.has(perm.id)}
                          onChange={() => onAlternar(perm, perms)}
                          disabled={somenteLeitura}
                          aria-label={`${ROTULO_ACAO_WEB[acao]} — ${modulo.descricao}${sensivel ? " (ação sensível)" : ""}`}
                          className={cn("w-3.5 h-3.5 rounded border-border accent-primary", sensivel && "accent-destructive")}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!somenteLeitura && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/50">
              Criar, Editar, Excluir ou Executar ligam Visualizar. Desmarcar Visualizar limpa a tela inteira.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
