import { useEffect, useRef, useState } from "react";
import { Loader2, X, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Endereco {
  id: string;
  codigo_endereco: string;
  descricao: string | null;
}

interface Props {
  value: string | null;
  onChange: (id: string | null, codigo?: string | null) => void;
  armazemId: string | null;
  tenantId: string | null;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  badge?: string;
}

export function EnderecoSearchInput({
  value,
  onChange,
  armazemId,
  tenantId,
  disabled,
  placeholder = "Digite o código do endereço...",
  label,
  badge,
}: Props) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<Endereco[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Endereco | null>(null);
  const debounceRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Hydrate chip from value
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!value) {
        setSelected(null);
        return;
      }
      if (selected?.id === value) return;
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id, codigo_endereco, descricao")
        .eq("id", value)
        .maybeSingle();
      if (!cancelled && data) setSelected(data);
    })();
    return () => { cancelled = true; };
  }, [value]);

  // Debounced search
  useEffect(() => {
    if (disabled || !armazemId || !tenantId) return;
    if (!term.trim()) {
      setResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("endereco")
        .select("id, codigo_endereco, descricao")
        .eq("armazem_id", armazemId)
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .ilike("codigo_endereco", `%${term.trim()}%`)
        .order("codigo_endereco")
        .limit(20);
      setLoading(false);
      if (!error) setResults(data || []);
    }, 250);
  }, [term, armazemId, tenantId, disabled]);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (e: Endereco) => {
    setSelected(e);
    setTerm("");
    setResults([]);
    setOpen(false);
    onChange(e.id, e.codigo_endereco);
  };

  const clear = () => {
    setSelected(null);
    setTerm("");
    onChange(null, null);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
          {label}
          {badge && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px] font-semibold tracking-normal normal-case">
              {badge}
            </span>
          )}
        </label>
      )}

      {selected ? (
        <div className={cn(
          "flex items-center justify-between gap-2 h-10 px-3 rounded-lg border bg-secondary/40",
          disabled ? "border-border opacity-60" : "border-primary/40"
        )}>
          <div className="flex flex-col leading-tight min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{selected.codigo_endereco}</span>
            {selected.descricao && (
              <span className="text-[11px] text-muted-foreground truncate">{selected.descricao}</span>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={clear}
              className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"
              title="Limpar"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            value={term}
            onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              "w-full h-10 pl-8 pr-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
              "border-border focus:border-primary focus:ring-1 focus:ring-primary/30",
              disabled && "opacity-60 cursor-not-allowed"
            )}
          />
          {loading && (
            <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
          )}
        </div>
      )}

      {open && !selected && term.trim() && (
        <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Nenhum endereço encontrado.</div>
          ) : (
            results.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors border-b border-border/40 last:border-0"
              >
                <div className="text-sm font-medium text-foreground">{r.codigo_endereco}</div>
                {r.descricao && (
                  <div className="text-[11px] text-muted-foreground truncate">{r.descricao}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
