import { Copy, LayoutGrid, Maximize, PencilLine, Plus, Settings2, Trash2, Unlink } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MenuContexto =
  | { tipo: "no"; x: number; y: number; noId: string; gatilho: boolean }
  | { tipo: "canvas"; x: number; y: number };

interface Props {
  menu: MenuContexto | null;
  limiteAtingido: boolean;
  onFechar: () => void;
  onAbrir: (id: string) => void;
  onRenomear: (id: string) => void;
  onDuplicar: (id: string) => void;
  onDesligarEntradas: (id: string) => void;
  onExcluir: (id: string) => void;
  onAdicionarAqui: (x: number, y: number) => void;
  onOrganizar: () => void;
  onAjustar: () => void;
}

export function NoContextMenu({ menu, limiteAtingido, onFechar, ...a }: Props) {
  return (
    <DropdownMenu open={!!menu} onOpenChange={(v) => { if (!v) onFechar(); }} modal={false}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 text-sm" onCloseAutoFocus={(e) => e.preventDefault()}>
        {menu?.tipo === "no" && (
          <>
            <DropdownMenuItem onSelect={() => a.onAbrir(menu.noId)}><Settings2 size={14} /> Abrir configuração<DropdownMenuShortcut>Enter</DropdownMenuShortcut></DropdownMenuItem>
            <DropdownMenuItem onSelect={() => a.onRenomear(menu.noId)}><PencilLine size={14} /> Renomear<DropdownMenuShortcut>F2</DropdownMenuShortcut></DropdownMenuItem>
            {!menu.gatilho && (
              <DropdownMenuItem disabled={limiteAtingido} onSelect={() => a.onDuplicar(menu.noId)}><Copy size={14} /> Duplicar<DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut></DropdownMenuItem>
            )}
            {!menu.gatilho && (
              <DropdownMenuItem onSelect={() => a.onDesligarEntradas(menu.noId)}><Unlink size={14} /> Desligar entradas</DropdownMenuItem>
            )}
            {!menu.gatilho && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-rose-400 focus:text-rose-400" onSelect={() => a.onExcluir(menu.noId)}><Trash2 size={14} /> Excluir<DropdownMenuShortcut>Delete</DropdownMenuShortcut></DropdownMenuItem>
              </>
            )}
          </>
        )}
        {menu?.tipo === "canvas" && (
          <>
            <DropdownMenuItem disabled={limiteAtingido} onSelect={() => a.onAdicionarAqui(menu.x, menu.y)}><Plus size={14} /> Adicionar nó aqui</DropdownMenuItem>
            <DropdownMenuItem onSelect={a.onOrganizar}><LayoutGrid size={14} /> Organizar</DropdownMenuItem>
            <DropdownMenuItem onSelect={a.onAjustar}><Maximize size={14} /> Ajustar à tela</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
