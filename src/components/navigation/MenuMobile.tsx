import { LogOut, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { localizarItem, type MenuGrupo } from "@/lib/menuRegistry";
import logoUrl from "@/assets/corelogitrack-logo.png";
import { EmpresaSelector } from "./EmpresaSelector";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Menu já filtrado pelas permissões do usuário. */
  menu: MenuGrupo[];
  currentPath: string;
  favoritos: string[];
  usuarioNome: string | null;
  onNavigate: (path: string) => void;
  onBuscar: () => void;
  onLogout: () => void;
}

/** Menu lateral do painel no mobile (< 768 px): todas as telas liberadas, em acordeão. */
export function MenuMobile({ open, onOpenChange, menu, currentPath, favoritos, usuarioNome, onNavigate, onBuscar, onLogout }: Props) {
  const grupoAtual = menu.find((g) => g.itens.some((i) => i.path === currentPath))?.id;
  const visiveis = new Set(menu.flatMap((g) => g.itens.map((i) => i.path)));
  const favoritosVisiveis = favoritos.filter((p) => visiveis.has(p));

  const ir = (path: string) => {
    onOpenChange(false);
    onNavigate(path);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] max-w-sm p-0 flex flex-col gap-0 bg-[hsl(var(--topbar-bg))]">
        <div className="flex items-center gap-2.5 h-14 px-4 border-b border-border shrink-0">
          <img src={logoUrl} alt="" className="w-7 h-7 object-contain" />
          <SheetTitle className="text-sm">
            <span className="font-bold text-foreground tracking-tight">CORE</span>
            <span className="font-bold text-primary tracking-tight"> LogiTrack</span>
          </SheetTitle>
          <SheetDescription className="sr-only">Menu de navegação do painel</SheetDescription>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3 border-b border-border shrink-0">
          <button
            onClick={() => { onOpenChange(false); onBuscar(); }}
            className="flex items-center gap-2 h-11 px-3 rounded-md border border-border bg-secondary/50 text-sm text-muted-foreground"
          >
            <Search size={15} /> Buscar tela…
          </button>
          <EmpresaSelector className="h-8 px-1" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {favoritosVisiveis.length > 0 && (
            <div className="px-2 pb-3">
              <span className="block pb-1.5 text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Favoritos</span>
              <div className="flex flex-wrap gap-1.5">
                {favoritosVisiveis.map((p) => (
                  <button
                    key={p}
                    onClick={() => ir(p)}
                    className="flex items-center gap-1 h-8 px-3 rounded-full bg-amber-500/10 text-amber-500 text-xs"
                  >
                    <Star size={11} className="fill-current" /> {localizarItem(p)?.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Accordion type="single" collapsible defaultValue={grupoAtual}>
            {menu.map((grupo) => (
              <AccordionItem key={grupo.id} value={grupo.id} className="border-b-0">
                <AccordionTrigger className="px-2 py-3 rounded-md text-sm font-medium hover:no-underline hover:bg-secondary">
                  <span className="flex items-center gap-2">
                    <grupo.icon size={15} className="text-muted-foreground" />
                    {grupo.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pb-2">
                  <div className="ml-4 pl-3 border-l border-border flex flex-col">
                    {grupo.itens.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => ir(item.path)}
                        aria-current={currentPath === item.path ? "page" : undefined}
                        className={cn(
                          "min-h-11 px-3 rounded-md text-left text-sm transition-colors",
                          currentPath === item.path ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
            {(usuarioNome || "U").slice(0, 2).toUpperCase()}
          </div>
          <span className="flex-1 min-w-0 truncate text-sm text-foreground">{usuarioNome || "Usuário"}</span>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-destructive"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
