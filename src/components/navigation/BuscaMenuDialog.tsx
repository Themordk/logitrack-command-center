import { Clock, Star } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { MenuGrupo, MenuItem } from "@/lib/menuRegistry";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Menu já filtrado pelas permissões do usuário. */
  menu: MenuGrupo[];
  favoritos: string[];
  recentes: string[];
  onNavigate: (path: string) => void;
}

/** Busca global de telas (Ctrl+K / lupa no mobile). Só lista o que o perfil libera. */
export function BuscaMenuDialog({ open, onOpenChange, menu, favoritos, recentes, onNavigate }: Props) {
  const porPath = new Map<string, { item: MenuItem; grupo: MenuGrupo }>();
  for (const grupo of menu) for (const item of grupo.itens) porPath.set(item.path, { item, grupo });

  const ir = (path: string) => {
    onOpenChange(false);
    onNavigate(path);
  };

  const linha = (path: string, prefixo: string, icone?: React.ReactNode) => {
    const achado = porPath.get(path);
    if (!achado) return null;
    const { item, grupo } = achado;
    return (
      <CommandItem
        key={`${prefixo}-${path}`}
        value={`${prefixo} ${item.label} ${grupo.label} ${(item.palavrasChave ?? []).join(" ")}`}
        onSelect={() => ir(path)}
      >
        {icone}
        <span>{item.label}</span>
        <span className="ml-auto text-xs text-muted-foreground">{grupo.label}</span>
      </CommandItem>
    );
  };

  const favoritosVisiveis = favoritos.filter((p) => porPath.has(p));
  const recentesVisiveis = recentes.filter((p) => porPath.has(p));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar tela…" />
      <CommandList>
        <CommandEmpty>Nenhuma tela liberada para o seu perfil corresponde à busca.</CommandEmpty>
        {favoritosVisiveis.length > 0 && (
          <CommandGroup heading="Favoritos">
            {favoritosVisiveis.map((p) => linha(p, "fav", <Star className="text-amber-500" />))}
          </CommandGroup>
        )}
        {recentesVisiveis.length > 0 && (
          <CommandGroup heading="Recentes">
            {recentesVisiveis.map((p) => linha(p, "rec", <Clock className="text-muted-foreground" />))}
          </CommandGroup>
        )}
        {menu.map((grupo) => (
          <CommandGroup key={grupo.id} heading={grupo.label}>
            {grupo.itens.map((item) => linha(item.path, grupo.id, <grupo.icon className="text-muted-foreground" />))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
