import { useState } from "react";
import { mockRastreabilidade } from "@/data/mockData";
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

const eventIcons: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  Recebimento: { icon: <ArrowDownToLine size={16} />, color: "text-blue-400", bg: "bg-blue-500/15 border-blue-500/30" },
  Conferência: { icon: <ClipboardCheck size={16} />, color: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30" },
  Armazenagem: { icon: <Warehouse size={16} />, color: "text-green-400", bg: "bg-green-500/15 border-green-500/30" },
  Separação: { icon: <ArrowRightLeft size={16} />, color: "text-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30" },
  Expedição: { icon: <Truck size={16} />, color: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
};

const stageLabels = ["Recebimento", "Conferência", "Armazenagem", "Separação", "Expedição"];

export function RastreabilidadePage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"hu" | "produto" | "pedido" | "endereco">("hu");
  const [result, setResult] = useState<typeof mockRastreabilidade | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = () => {
    if (!query.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setResult(mockRastreabilidade);
      setLoading(false);
    }, 800);
  };

  const currentStage = result
    ? stageLabels.indexOf(result.eventos[result.eventos.length - 1].tipo)
    : -1;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
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

      {/* Search panel */}
      <div className="card-surface p-6">
        <div className="flex flex-col gap-4">
          {/* Type selector */}
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

          {/* Search input */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 bg-secondary rounded-xl px-4 py-3 border border-border focus-within:border-primary/50 transition-colors">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder={
                  searchType === "hu" ? "Ex.: HU-00001 ou SSCC 00340000..." :
                  searchType === "produto" ? "Ex.: Notebook Pro X1 ou SKU ELT-001" :
                  searchType === "pedido" ? "Ex.: PED-10001" :
                  "Ex.: R01-P01-N01-A01"
                }
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
              />
              {query && (
                <button onClick={() => { setQuery(""); setResult(null); }} className="text-muted-foreground hover:text-foreground transition-colors text-xs">✕</button>
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

          {/* Quick search suggestions */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Exemplos:</span>
            {["HU-00001", "PED-10001", "R01-P01-N01-A01", "ELT-001"].map((s) => (
              <button
                key={s}
                onClick={() => { setQuery(s); }}
                className="px-2 py-1 rounded bg-secondary text-xs text-muted-foreground hover:text-foreground font-mono transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="card-surface p-5 border-l-4 border-primary">
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                  <Box size={18} className="text-primary" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">HU / SSCC</div>
                  <div className="font-mono text-sm font-bold text-foreground">{result.hu}</div>
                  <div className="font-mono text-xs text-muted-foreground">{result.sscc}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Produto</div>
                <div className="text-sm font-medium text-foreground">{result.produto}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Pedido</div>
                <div className="font-mono text-sm font-medium text-foreground">{result.pedido}</div>
              </div>
              <div className="ml-auto">
                <div className="text-xs text-muted-foreground mb-1">Estágio Atual</div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium badge-moving">
                  {result.eventos[result.eventos.length - 1].tipo}
                </span>
              </div>
            </div>
          </div>

          {/* Progress stages */}
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Progresso da Jornada</h3>
            <div className="flex items-center gap-0">
              {stageLabels.map((stage, idx) => {
                const done = idx < result.eventos.length;
                const current = idx === result.eventos.length - 1;
                return (
                  <div key={stage} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                        current ? "border-primary bg-primary/20 text-primary" :
                        done ? "border-green-500 bg-green-500/20 text-green-400" :
                        "border-border bg-secondary text-muted-foreground"
                      )}>
                        {done ? <CheckCircle2 size={16} /> : idx + 1}
                      </div>
                      <div className={cn("text-xs mt-1.5 text-center font-medium", done ? "text-foreground" : "text-muted-foreground")}>
                        {stage}
                      </div>
                    </div>
                    {idx < stageLabels.length - 1 && (
                      <div className={cn("h-0.5 flex-1 mx-1 rounded", idx < result.eventos.length - 1 ? "bg-green-500/50" : "bg-border")} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Timeline */}
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold text-foreground mb-5">Timeline de Eventos</h3>
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />

              <div className="space-y-0">
                {result.eventos.map((evento, idx) => {
                  const iconConfig = eventIcons[evento.tipo] || { icon: <Package size={16} />, color: "text-muted-foreground", bg: "bg-secondary border-border" };
                  const isLast = idx === result.eventos.length - 1;

                  return (
                    <div key={evento.id} className="relative flex gap-6 pb-6">
                      {/* Icon */}
                      <div className={cn(
                        "relative z-10 flex items-center justify-center w-10 h-10 rounded-full border shrink-0",
                        iconConfig.bg, iconConfig.color
                      )}>
                        {iconConfig.icon}
                      </div>

                      {/* Content */}
                      <div className={cn("flex-1 card-surface p-4 mb-0 hover:border-primary/20 transition-colors", isLast && "border-primary/30")}>
                        <div className="flex items-start justify-between flex-wrap gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={cn("text-sm font-semibold", iconConfig.color)}>{evento.tipo}</span>
                              {isLast && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs badge-moving">
                                  Atual
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-foreground mt-0.5">{evento.descricao}</p>
                          </div>
                          <span className={cn(
                            "text-xs px-2 py-1 rounded-full",
                            evento.status === "concluido" ? "badge-free" : "badge-moving"
                          )}>
                            {evento.status === "concluido" ? "Concluído" : "Em Andamento"}
                          </span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <User size={11} className="shrink-0" />
                            <span className="truncate">{evento.usuario}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock size={11} className="shrink-0" />
                            <span className="truncate">{evento.dataHora}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin size={11} className="shrink-0" />
                            <span className="truncate font-mono">{evento.localizacao}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Package size={11} className="shrink-0" />
                            <span className="truncate">{evento.grupoOperacional}</span>
                          </div>
                        </div>

                        {evento.detalhes && (
                          <div className="mt-2 px-3 py-2 rounded-lg bg-secondary/50 text-xs text-muted-foreground">
                            {evento.detalhes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="card-surface p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Scan size={28} className="text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-2">Rastreamento Operacional</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Busque por um código de HU, produto, pedido ou endereço para visualizar a timeline completa de movimentações.
          </p>
        </div>
      )}
    </div>
  );
}
