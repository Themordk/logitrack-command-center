import { useState } from "react";
import {
  Search,
  Package,
  MapPin,
  User,
  Clock,
  CheckCircle2,
  Loader2,
  Truck,
  Box,
  ArrowDownToLine,
  ClipboardCheck,
  Warehouse,
  ArrowRightLeft,
  Scan,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";

const eventIcons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  Recebimento: { icon: <ArrowDownToLine size={16} />, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  Conferência: { icon: <ClipboardCheck size={16} />, color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30" },
  Armazenagem: { icon: <Warehouse size={16} />, color: "text-green-400", bg: "bg-green-500/15 border-green-500/30" },
  Separação: { icon: <ArrowRightLeft size={16} />, color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
  Expedição: { icon: <Truck size={16} />, color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
};

const stageLabels = ["Recebimento", "Conferência", "Armazenagem", "Separação", "Expedição"];

interface RastreioResult {
  hu: string;
  codigo_hu: string;
  tipo_hu: string;
  disponibilidade: string;
}

export function RastreabilidadePage() {
  const { tenantId } = useTenant();
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"hu" | "produto" | "pedido" | "endereco">("hu");
  const [result, setResult] = useState<RastreioResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async () => {
    if (!query.trim() || !tenantId) return;
    setLoading(true);
    setNotFound(false);
    setResult(null);

    try {
      if (searchType === "hu") {
        const { data } = await (supabase as any).from("hu")
          .select("*")
          .eq("tenant_id", tenantId)
          .or(`codigo_hu.ilike.%${query}%`)
          .limit(1)
          .maybeSingle();
        if (data) {
          setResult({
            hu: data.id,
            codigo_hu: data.codigo_hu || "—",
            tipo_hu: data.tipo_hu || "—",
            disponibilidade: data.disponibilidade || "DISPONIVEL",
          });
        } else {
          setNotFound(true);
        }
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rastreamento Operacional</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Acompanhe a jornada completa de HUs, produtos, pedidos e endereços</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary">
          <Scan size={12} />
          Rastreabilidade Total
        </div>
      </div>

      <div className="card-surface p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            {(["hu", "produto", "pedido", "endereco"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSearchType(t)}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                  searchType === t
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "bg-secondary/50 text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary"
                )}
              >
                {t === "hu" ? "Código HU" : t === "produto" ? "Produto" : t === "pedido" ? "Pedido" : "Endereço"}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 bg-secondary rounded-xl px-4 py-3 border border-border focus-within:border-primary/50 transition-colors">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={
                  searchType === "hu" ? "Ex.: HU-000000001" :
                  searchType === "produto" ? "Ex.: SKU ou descrição" :
                  searchType === "pedido" ? "Ex.: PED-10001" :
                  "Ex.: R01-P01-N01-A01"
                }
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResult(null); setNotFound(false); }} className="text-muted-foreground hover:text-foreground transition-colors text-xs">✕</button>
              )}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              {loading ? "Buscando..." : "Rastrear"}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="card-surface p-5 border-l-4 border-primary">
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <Box size={18} className="text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">HU</div>
                <div className="font-mono text-sm font-bold text-foreground">{result.codigo_hu}</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Tipo</div>
              <div className="text-sm font-medium text-foreground">{result.tipo_hu}</div>
            </div>
            <div className="ml-auto">
              <div className="text-xs text-muted-foreground mb-1">Disponibilidade</div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium badge-moving">
                {result.disponibilidade}
              </span>
            </div>
          </div>
        </div>
      )}

      {notFound && !loading && (
        <div className="card-surface p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum resultado encontrado para "<span className="text-foreground font-medium">{query}</span>".</p>
        </div>
      )}

      {!result && !notFound && !loading && (
        <div className="card-surface p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Scan size={28} className="text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-2">Rastreamento Operacional</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Busque por um código de HU para visualizar informações em tempo real do banco de dados.
          </p>
        </div>
      )}
    </div>
  );
}
