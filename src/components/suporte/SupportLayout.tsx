import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Boxes, LogOut, ChevronRight, Building2, MessageSquare, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import logoAsset from "@/assets/corelogitrack-logo.png.asset.json";

interface Props {
  currentPath: string;
  onNavigate: (path: string) => void;
}

const items = [
  { label: "Tenants", icon: <Building2 size={15} />, path: "/suporte/tenants" },
  { label: "Chamados", icon: <MessageSquare size={15} />, path: "/suporte/chamados" },
];

export function SupportTopNav({ currentPath, onNavigate }: Props) {
  const { logout } = useTenant();
  const [nome, setNome] = useState<string>(localStorage.getItem("core_usuario_nome") || "Suporte");

  useEffect(() => {
    setNome(localStorage.getItem("core_usuario_nome") || "Suporte");
  }, [currentPath]);

  const handleLogout = async () => {
    localStorage.removeItem("core_is_platform_support");
    await logout();
    onNavigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 border-b border-[hsl(var(--topbar-border))] bg-[hsl(var(--topbar-bg))]">
      <div className="flex h-full items-center px-4 gap-0">
        <div className="flex items-center gap-2.5 pr-6 border-r border-border">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary">
            <Boxes size={14} className="text-primary-foreground" />
          </div>
          <div>
            <span className="font-bold text-sm text-foreground tracking-tight">CORE</span>
            <span className="font-bold text-sm text-primary tracking-tight"> LogiTrack</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-4 border-r border-border mr-2">
          <ShieldCheck size={13} className="text-amber-400" />
          <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Suporte</span>
        </div>

        <nav className="flex items-center gap-0.5 flex-1">
          {items.map((item) => {
            const isActive = currentPath.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={cn("nav-item", isActive && "nav-item-active text-primary")}
              >
                {item.icon}
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-secondary transition-colors">
            <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-xs font-semibold text-amber-400">
              {nome.slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left hidden md:block">
              <div className="text-xs font-medium text-foreground leading-none">{nome}</div>
            </div>
          </button>
          <button
            onClick={handleLogout}
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

interface LayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  breadcrumb?: { label: string; path?: string }[];
  children: React.ReactNode;
}

export function SupportLayout({ currentPath, onNavigate, breadcrumb, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <SupportTopNav currentPath={currentPath} onNavigate={onNavigate} />
      <div className="pt-14">
        {breadcrumb && (
          <div className="border-b border-border bg-card">
            <div className="px-6 py-2.5 flex items-center gap-1.5 text-xs">
              {breadcrumb.map((b, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight size={11} className="text-muted-foreground/50" />}
                  {b.path ? (
                    <button
                      onClick={() => onNavigate(b.path!)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {b.label}
                    </button>
                  ) : (
                    <span className={i === breadcrumb.length - 1 ? "text-foreground font-medium" : "text-muted-foreground"}>
                      {b.label}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
