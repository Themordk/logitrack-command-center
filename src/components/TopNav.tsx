import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { getModuleForChildRoute } from "@/hooks/useRoutePermission";
import { supabase } from "@/integrations/supabase/client";

import {
  Building2,
  Package,
  Activity,
  BarChart3,
  Settings,
  ChevronDown,
  Bell,
  ChevronRight,
  Search,
  MapPin,
  Boxes,
  LayoutDashboard,
  Scan,
  LogOut,
} from "lucide-react";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string }[];
}

const navItems: NavItem[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={15} />,
    path: "/",
  },
  {
    label: "Rastreabilidade",
    icon: <Scan size={15} />,
    path: "/rastreabilidade",
  },
  {
    label: "Armazém",
    icon: <Building2 size={15} />,
    children: [
      { label: "Cadastro de Armazém", path: "/armazem/armazens" },
      { label: "Tipos de Estoque", path: "/armazem/tipos-estoque" },
      { label: "Setores", path: "/armazem/setores" },
      { label: "Localizações / Endereços", path: "/armazem/enderecos" },
      { label: "Box", path: "/armazem/box" },
      { label: "Turnos", path: "/armazem/turnos" },
      { label: "Motivos de Ocorrência", path: "/armazem/motivos" },
      { label: "Veículos", path: "/armazem/veiculos" },
      { label: "Zonas de Atividade", path: "/armazem/zonas" },
      { label: "Roteiro de Separação", path: "/armazem/roteiro-separacao" },
    ],
  },
  {
    label: "Dados Mestres",
    icon: <Package size={15} />,
    children: [
      { label: "Produtos", path: "/dados-mestres/produtos" },
      { label: "Grupos de Produtos", path: "/dados-mestres/grupos" },
      { label: "Subgrupos de Produtos", path: "/dados-mestres/subgrupos" },
      { label: "Parceiros", path: "/dados-mestres/parceiros" },
      { label: "Rotas", path: "/dados-mestres/rotas" },
      { label: "Tipos de Entrada", path: "/dados-mestres/tipos-entrada" },
      { label: "Tipos de Saída", path: "/dados-mestres/tipos-saida" },
    ],
  },
  {
    label: "Atividades",
    icon: <Activity size={15} />,
    children: [
      { label: "Gerar HU", path: "/atividades/hus" },
      { label: "Gerar Entradas", path: "/atividades/entradas" },
      { label: "Gerar Saída", path: "/atividades/saidas" },
      { label: "Movimento de Entrada", path: "/atividades/movimentos" },
      { label: "Abastecimento", path: "/atividades/Abastecimento" },
      { label: "Ondas de Carregamento", path: "/atividades/mov-saida" },
      { label: "Volumes", path: "/atividades/volumes" },
      { label: "Embarque", path: "/atividades/embarque" },
      { label: "Inventário", path: "/atividades/inventario" },
    ],
  },
  {
    label: "Relatórios",
    icon: <BarChart3 size={15} />,
    children: [
      { label: "Posição de Estoque", path: "/relatorios/estoque" },
      { label: "Histórico de Movimentos", path: "/relatorios/movimentacoes" },
      { label: "Ocupação de Endereços", path: "/relatorios/ocupacao" },
      { label: "Expedições", path: "/relatorios/expedicoes" },
      { label: "Inventário", path: "/relatorios/inventario" },
    ],
  },
  {
    label: "Configurações",
    icon: <Settings size={15} />,
    children: [
      { label: "Empresas", path: "/config/empresas" },
      { label: "Usuários", path: "/config/usuarios" },
      { label: "Integração ERP", path: "/config/integracao" },
      { label: "Perfis de Acesso", path: "/config/perfis" },
    ],
  },
];

interface TopNavProps {
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function TopNav({ currentPath, onNavigate }: TopNavProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { tenantId, empresaId, usuarioNome, logout } = useTenant();
  const { can } = usePermissions();
  const [empresas, setEmpresas] = useState<{ id: string; codigo: string | null; razaosocial: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    (supabase as any)
      .from("empresa")
      .select("id, codigo, razaosocial")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("razaosocial")
      .then(({ data }: any) => setEmpresas(data || []));
  }, [tenantId]);

  // Filter nav items based on permissions
  const filteredNavItems = navItems.map((item) => {
    if (!item.children) {
      const modCode = item.path ? getModuleForChildRoute(item.path) : null;
      if (modCode && !can(modCode, "READ")) return null;
      return item;
    }
    const filteredChildren = item.children.filter((child) => {
      const modCode = getModuleForChildRoute(child.path);
      return !modCode || can(modCode, "READ");
    });
    if (filteredChildren.length === 0) return null;
    return { ...item, children: filteredChildren };
  }).filter(Boolean) as NavItem[];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNav = (path: string) => {
    onNavigate(path);
    setOpenMenu(null);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-[hsl(var(--topbar-border))] bg-[hsl(var(--topbar-bg))]">
      <div className="flex h-full items-center px-4 gap-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 pr-6 border-r border-border">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary">
            <Boxes size={14} className="text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-sm text-foreground tracking-tight">CORE</span>
            <span className="font-bold text-sm text-primary tracking-tight"> LogiTrack</span>
          </div>
        </div>

        {/* Empresa selector */}
        <div className="flex items-center gap-1.5 px-4 border-r border-border mr-2">
          <MapPin size={13} className="text-muted-foreground" />
          <select
            value={empresaId || ""}
            className="bg-transparent text-xs text-foreground border-none outline-none cursor-pointer"
            disabled
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.codigo ? `${e.codigo} – ${e.razaosocial}` : e.razaosocial}
              </option>
            ))}
            {empresas.length === 0 && <option value="">Nenhuma empresa</option>}
          </select>
        </div>

        {/* Nav items */}
        <nav ref={menuRef} className="flex items-center gap-0.5 flex-1">
          {filteredNavItems.map((item) => {
            const isActive = item.path ? currentPath === item.path : item.children?.some((c) => c.path === currentPath);
            const isOpen = openMenu === item.label;

            if (!item.children) {
              return (
                <button
                  key={item.label}
                  onClick={() => handleNav(item.path!)}
                  className={cn("nav-item", isActive && "nav-item-active text-primary")}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            }

            return (
              <div key={item.label} className="relative">
                <button
                  onClick={() => setOpenMenu(isOpen ? null : item.label)}
                  className={cn("nav-item", (isActive || isOpen) && "nav-item-active")}
                >
                  {item.icon}
                  {item.label}
                  <ChevronDown size={12} className={cn("transition-transform duration-200", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 rounded-lg border border-border bg-card shadow-elevated animate-fade-in z-50 overflow-hidden">
                    <div className="p-1">
                      {item.children.map((child) => (
                        <button
                          key={child.path}
                          onClick={() => handleNav(child.path)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2 text-xs rounded-md transition-colors",
                            currentPath === child.path
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:text-foreground hover:bg-secondary",
                          )}
                        >
                          <ChevronRight size={11} className="opacity-40" />
                          {child.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Search 
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-secondary/50 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Search size={13} />
            <span>Buscar...</span>
            <kbd className="text-xs bg-muted px-1 rounded">⌘K</kbd>
          </button> */}

          {/* Notifications */}
          <button className="relative flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors">
            <Bell size={15} className="text-muted-foreground" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-destructive border border-card" />
          </button>

          {/* User */}
          <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-secondary transition-colors">
            <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">
              {(usuarioNome || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-medium text-foreground leading-none">{usuarioNome || "Usuário"}</div>
            </div>
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-secondary transition-colors"
            title="Sair"
          >
            <LogOut size={15} className="text-muted-foreground" />
          </button>
        </div>
      </div>
    </header>
  );
}
