import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMenuPreferencias } from "@/hooks/useMenuPreferencias";
import { filtrarMenu, localizarItem, type MenuGrupo } from "@/lib/menuRegistry";
import logoUrl from "@/assets/corelogitrack-logo.png";
import { NotificacoesDropdown } from "@/components/NotificacoesDropdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmpresaSelector } from "@/components/navigation/EmpresaSelector";
import { MenuGrupoPainel } from "@/components/navigation/MenuGrupoPainel";
import { BuscaMenuDialog } from "@/components/navigation/BuscaMenuDialog";
import { MenuMobile } from "@/components/navigation/MenuMobile";
import { ChevronDown, LogOut, Menu, MoreHorizontal, Search } from "lucide-react";

interface TopNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const MAIS = "__mais";

export function TopNav({ currentPath, onNavigate }: TopNavProps) {
  const { usuarioId, usuarioNome, logout } = useTenant();
  const { can } = usePermissions();
  const isMobile = useIsMobile();
  const { favoritos, recentes, alternarFavorito, registrarVisita } = useMenuPreferencias(usuarioId);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);

  // Menu filtrado pelas permissões (o menu oculto no perfil já chega sem READ do banco)
  const menu = useMemo(() => filtrarMenu(can), [can]);

  // Recentes: registra a tela do menu aberta agora
  useEffect(() => {
    if (localizarItem(currentPath)) registrarVisita(currentPath);
  }, [currentPath, registrarVisita]);

  // Ctrl+K / ⌘K abre a busca global
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscaAberta((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Priority+: quantos grupos cabem na barra; o resto vai para "Mais" ──
  const navRef = useRef<HTMLDivElement>(null);
  const medidaRef = useRef<HTMLDivElement>(null);
  const [cabem, setCabem] = useState(menu.length);

  useLayoutEffect(() => {
    if (isMobile) return;
    const calcular = () => {
      const disponivel = navRef.current?.clientWidth ?? 0;
      const filhos = Array.from(medidaRef.current?.children ?? []) as HTMLElement[];
      if (!disponivel || filhos.length === 0) return;
      const larguraMais = filhos[filhos.length - 1].offsetWidth;
      const larguras = filhos.slice(0, -1).map((el) => el.offsetWidth + 2); // + gap-0.5
      const total = larguras.reduce((a, b) => a + b, 0);
      if (total <= disponivel) {
        setCabem(larguras.length);
        return;
      }
      let usado = larguraMais;
      let n = 0;
      while (n < larguras.length && usado + larguras[n] <= disponivel) {
        usado += larguras[n];
        n++;
      }
      setCabem(n);
    };
    calcular();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(calcular);
    if (navRef.current) ro.observe(navRef.current);
    return () => ro.disconnect();
  }, [menu, isMobile]);

  const naBarra = menu.slice(0, cabem);
  const noMais = menu.slice(cabem);

  const ir = (path: string) => {
    setOpenMenu(null);
    onNavigate(path);
  };

  const grupoAtivo = (g: MenuGrupo) => g.itens.some((i) => i.path === currentPath);

  const rotuloGrupo = (g: MenuGrupo) => (
    <>
      <g.icon size={15} />
      <span className="hidden xl:inline">{g.label}</span>
      <span className="xl:hidden">{g.labelCurto}</span>
    </>
  );

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-[hsl(var(--topbar-border))] bg-[hsl(var(--topbar-bg))]">
      <div className="flex h-full items-center px-2 md:px-4 gap-0">
        {/* Mobile: abre o menu lateral */}
        {isMobile && (
          <button
            onClick={() => setMenuMobileAberto(true)}
            aria-label="Abrir menu"
            className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-secondary transition-colors"
          >
            <Menu size={20} className="text-foreground" />
          </button>
        )}

        {/* Logo */}
        <div className={cn("flex items-center gap-2.5", isMobile ? "pl-1 flex-1" : "pr-6 border-r border-border")}>
          <img src={logoUrl} alt="CORE LogiTrack" className="w-7 h-7 object-contain" />
          <div>
            <span className="font-bold text-sm text-foreground tracking-tight">CORE</span>
            <span className="font-bold text-sm text-primary tracking-tight"> LogiTrack</span>
          </div>
        </div>

        {/* Empresa — no mobile fica dentro do menu lateral */}
        {!isMobile && <EmpresaSelector className="px-4 border-r border-border mr-2" />}

        {/* Grupos do menu — desktop/tablet */}
        {!isMobile && (
          <nav ref={navRef} aria-label="Menu principal" className="relative flex-1 min-w-0 flex items-center gap-0.5 overflow-hidden">
            {/* Linha invisível só para medir as larguras (mesmo markup dos botões) */}
            <div ref={medidaRef} aria-hidden className="absolute left-0 top-0 w-max invisible pointer-events-none flex items-center gap-0.5 whitespace-nowrap">
              {menu.map((g) => (
                <span key={g.id} className="nav-item">
                  {rotuloGrupo(g)}
                  {g.itens.length > 1 && <ChevronDown size={12} />}
                </span>
              ))}
              <span className="nav-item"><MoreHorizontal size={15} /> Mais <ChevronDown size={12} /></span>
            </div>

            {naBarra.map((g) => {
              const ativo = grupoAtivo(g);
              // Grupo de uma tela só (Torre de Controle) navega direto
              if (g.itens.length === 1) {
                return (
                  <button
                    key={g.id}
                    onClick={() => ir(g.itens[0].path)}
                    aria-current={ativo ? "page" : undefined}
                    className={cn("nav-item shrink-0 whitespace-nowrap", ativo && "nav-item-active text-primary")}
                  >
                    {rotuloGrupo(g)}
                  </button>
                );
              }
              const aberto = openMenu === g.id;
              return (
                <Popover key={g.id} open={aberto} onOpenChange={(o) => setOpenMenu(o ? g.id : null)}>
                  <PopoverTrigger asChild>
                    <button className={cn("nav-item shrink-0 whitespace-nowrap", (ativo || aberto) && "nav-item-active")}>
                      {rotuloGrupo(g)}
                      <ChevronDown size={12} className={cn("transition-transform duration-200", aberto && "rotate-180")} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto max-w-[90vw] p-1 shadow-elevated">
                    <MenuGrupoPainel
                      grupo={g}
                      currentPath={currentPath}
                      favoritos={favoritos}
                      onNavigate={ir}
                      onFavorito={alternarFavorito}
                    />
                  </PopoverContent>
                </Popover>
              );
            })}

            {noMais.length > 0 && (
              <Popover open={openMenu === MAIS} onOpenChange={(o) => setOpenMenu(o ? MAIS : null)}>
                <PopoverTrigger asChild>
                  <button className={cn("nav-item shrink-0 whitespace-nowrap", (openMenu === MAIS || noMais.some(grupoAtivo)) && "nav-item-active")}>
                    <MoreHorizontal size={15} /> Mais
                    <ChevronDown size={12} className={cn("transition-transform duration-200", openMenu === MAIS && "rotate-180")} />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto max-w-[90vw] max-h-[70vh] overflow-y-auto p-1 shadow-elevated">
                  <div className="flex flex-col gap-2">
                    {noMais.map((g) => (
                      <MenuGrupoPainel
                        key={g.id}
                        grupo={g}
                        comTitulo
                        currentPath={currentPath}
                        favoritos={favoritos}
                        onNavigate={ir}
                        onFavorito={alternarFavorito}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2 pl-2">
          {isMobile ? (
            <button
              onClick={() => setBuscaAberta(true)}
              aria-label="Buscar tela"
              className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-secondary transition-colors"
            >
              <Search size={18} className="text-muted-foreground" />
            </button>
          ) : (
            <button
              onClick={() => setBuscaAberta(true)}
              aria-label="Buscar tela (Ctrl+K)"
              className="flex items-center gap-2 px-2 xl:px-3 py-1.5 rounded-md border border-border bg-secondary/50 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Search size={13} />
              <span className="hidden xl:inline">Buscar...</span>
              <kbd className="hidden xl:inline text-[10px] bg-muted px-1 rounded">Ctrl K</kbd>
            </button>
          )}

          {/* Notifications — desktop only */}
          {!isMobile && <NotificacoesDropdown onNavigate={onNavigate} />}

          {/* User — desktop only */}
          {!isMobile && (
            <div className="flex items-center gap-2 px-2 py-1 rounded-md">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
                {(usuarioNome || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-medium text-foreground leading-none">{usuarioNome || "Usuário"}</div>
              </div>
            </div>
          )}

          {/* Logout — no mobile fica no rodapé do menu lateral */}
          {!isMobile && (
            <button
              onClick={logout}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut size={15} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      <BuscaMenuDialog
        open={buscaAberta}
        onOpenChange={setBuscaAberta}
        menu={menu}
        favoritos={favoritos}
        recentes={recentes}
        onNavigate={onNavigate}
      />

      {isMobile && (
        <MenuMobile
          open={menuMobileAberto}
          onOpenChange={setMenuMobileAberto}
          menu={menu}
          currentPath={currentPath}
          favoritos={favoritos}
          usuarioNome={usuarioNome}
          onNavigate={onNavigate}
          onBuscar={() => setBuscaAberta(true)}
          onLogout={logout}
        />
      )}
    </header>
  );
}
