import { ChevronRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { secoesDoGrupo, type MenuGrupo } from "@/lib/menuRegistry";

interface Props {
  grupo: MenuGrupo;
  currentPath: string;
  favoritos: string[];
  onNavigate: (path: string) => void;
  onFavorito: (path: string) => void;
  /** Mostra o nome do grupo no topo (usado no "Mais"). */
  comTitulo?: boolean;
}

/** Conteúdo do menu de um grupo: colunas por seção (mega-menu) ou lista simples. */
export function MenuGrupoPainel({ grupo, currentPath, favoritos, onNavigate, onFavorito, comTitulo }: Props) {
  const secoes = secoesDoGrupo(grupo);
  const temSecoes = secoes.length > 1 || secoes[0]?.titulo;
  const colunas = temSecoes ? Math.min(secoes.length, 3) : grupo.itens.length > 8 ? 2 : 1;

  return (
    <div className="flex flex-col gap-1">
      {comTitulo && (
        <div className="flex items-center gap-1.5 px-2 pt-1 text-xs font-semibold text-foreground">
          <grupo.icon size={13} className="text-muted-foreground" /> {grupo.label}
        </div>
      )}
      <div
        className="grid gap-x-2"
        style={{ gridTemplateColumns: `repeat(${colunas}, minmax(200px, 1fr))` }}
      >
        {(temSecoes ? secoes : [{ titulo: null, itens: grupo.itens }]).map((secao) => (
          <div key={secao.titulo ?? "itens"} className={cn("flex flex-col", !temSecoes && colunas > 1 && "contents")}>
            {secao.titulo && (
              <span className="px-3 pt-1 pb-1.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">
                {secao.titulo}
              </span>
            )}
            {secao.itens.map((item) => {
              const ativo = currentPath === item.path;
              const favorito = favoritos.includes(item.path);
              return (
                <div key={item.path} className="group flex items-center rounded-md">
                  <button
                    onClick={() => onNavigate(item.path)}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex-1 flex items-center gap-2 px-3 py-2 text-xs rounded-md text-left transition-colors",
                      ativo ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                    )}
                  >
                    <ChevronRight size={11} className="opacity-40" />
                    {item.label}
                  </button>
                  <button
                    onClick={() => onFavorito(item.path)}
                    aria-label={favorito ? `Remover ${item.label} dos favoritos` : `Adicionar ${item.label} aos favoritos`}
                    aria-pressed={favorito}
                    className={cn(
                      "w-7 h-7 flex items-center justify-center rounded-md transition-opacity",
                      favorito ? "text-amber-500 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
                    )}
                  >
                    <Star size={12} className={favorito ? "fill-current" : undefined} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
