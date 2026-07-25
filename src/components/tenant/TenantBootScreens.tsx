import { Boxes, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useTenantBoot } from "@/contexts/TenantBootContext";
import { buildAppUrl, buildTenantUrl, getRootDomain } from "@/lib/tenantSubdomain";
import { useState } from "react";
import logoAsset from "@/assets/corelogitrack-logo.png.asset.json";

const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export function TenantBootSplash() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center p-2">
          <img src={logoAsset.url} alt="CORE LogiTrack" className="w-full h-full object-contain" />
        </div>
        <Loader2 className="text-primary animate-spin" size={24} />
        <div className="text-sm text-muted-foreground">Identificando seu ambiente…</div>
      </div>
    </div>
  );
}

export function TenantBootError() {
  const { status, errorMessage, retry, slug } = useTenantBoot();

  const titles: Record<string, string> = {
    "not-found": "Cliente não encontrado",
    "inactive": "Acesso suspenso",
    "error": "Falha ao validar o ambiente",
  };
  const messages: Record<string, string> = {
    "not-found": slug
      ? `O endereço "${slug}.${getRootDomain()}" não corresponde a nenhum cliente cadastrado.`
      : "Endereço inválido.",
    "inactive": "Este ambiente está temporariamente indisponível. Entre em contato com o suporte.",
    "error": errorMessage || "Não foi possível conectar ao servidor. Tente novamente em alguns instantes.",
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="card-surface p-8 max-w-md w-full text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertCircle size={28} className="text-destructive" />
        </div>
        <h1 className="text-lg font-bold text-foreground">{titles[status] || "Erro"}</h1>
        <p className="text-sm text-muted-foreground">{messages[status]}</p>
        <div className="flex flex-col gap-2 pt-2">
          {status === "error" && (
            <button
              onClick={retry}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <RefreshCw size={14} /> Tentar novamente
            </button>
          )}
          <a
            href={buildAppUrl()}
            className="w-full inline-block px-4 py-2.5 rounded-lg border border-border bg-secondary/40 text-sm text-foreground hover:bg-secondary/60 transition-colors"
          >
            Ir para o portal principal
          </a>
        </div>
        <p className="text-xs text-muted-foreground pt-2">
          Suporte: <span className="text-foreground">suporte.corelogitrack@gmail.com</span>
        </p>
      </div>
    </div>
  );
}

interface TenantPickerPageProps {
  onNavigateSupport?: () => void;
}

export function TenantPickerPage({ onNavigateSupport }: TenantPickerPageProps) {
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  const goSupport = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Rota dedicada ao login do suporte da plataforma
    if (onNavigateSupport) {
      onNavigateSupport();
      return;
    }
    window.location.hash = "/suporte-login";
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = slug.trim().toLowerCase();
    if (!SLUG_RE.test(v)) {
      setError("Use apenas letras minúsculas, números e hífen (2 a 40 caracteres).");
      return;
    }
    window.location.href = buildTenantUrl(v);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="card-surface p-8 max-w-sm w-full">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center">
            <Boxes size={28} className="text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">
              CORE <span className="text-primary">LogiTrack</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">Portal de Acesso</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block text-xs font-medium text-muted-foreground uppercase">
            Identificação do cliente
          </label>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/40 px-3 h-10 focus-within:border-primary transition-colors">
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setError(null);
                setSlug(e.target.value);
              }}
              placeholder="meucliente"
              className="flex-1 bg-transparent text-sm text-foreground outline-none"
              autoFocus
            />
            <span className="text-xs text-muted-foreground">.{getRootDomain()}</span>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="submit"
            className="w-full px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Acessar
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={goSupport}
            formNoValidate
            className="text-xs text-muted-foreground hover:text-primary transition-colors underline underline-offset-2"
          >
            Sou do suporte da plataforma
          </button>
        </div>
      </div>
    </div>
  );
}
