import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { ChevronDown, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

export interface ParceiroFiltroOpcao {
  id: string;
  razaosocial: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  codigo_erp: string | null;
}

interface ParceiroFilterProps {
  value: string | null;
  /** Nome exibido no gatilho quando há parceiro selecionado. */
  label?: string;
  onChange: (id: string | null, parceiro: ParceiroFiltroOpcao | null) => void;
  tenantId: string | null;
  empresaId: string | null;
  placeholder?: string;
  className?: string;
}

/**
 * Filtro de parceiro para telas de relatório — mesmo visual compacto do
 * MultiSelectFilter (gatilho h-8 / text-xs, busca em Popover), com busca no
 * servidor (razão social, fantasia, CNPJ ou código ERP; mínimo 2 caracteres).
 * Formulários de cadastro continuam usando ParceiroSearchInput.
 */
export function ParceiroFilter({
  value,
  label,
  onChange,
  tenantId,
  empresaId,
  placeholder = "Todos",
  className,
}: ParceiroFilterProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<ParceiroFiltroOpcao[]>([]);
  const [loading, setLoading] = useState(false);
  const termo = useDebounce(busca.trim(), 250);

  useEffect(() => {
    let cancelado = false;
    if (!open || !tenantId || !empresaId || termo.length < 2) {
      setOpcoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const padrao = `%${termo.replace(/[%,()]/g, " ")}%`;
      const { data, error } = await (supabase as any)
        .from("parceiro")
        .select("id, razaosocial, nome_fantasia, cnpj, codigo_erp")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .or(`razaosocial.ilike.${padrao},nome_fantasia.ilike.${padrao},cnpj.ilike.${padrao},codigo_erp.ilike.${padrao}`)
        .order("razaosocial")
        .limit(30);
      if (cancelado) return;
      setLoading(false);
      setOpcoes(error ? [] : ((data as ParceiroFiltroOpcao[]) || []));
    })();
    return () => {
      cancelado = true;
    };
  }, [termo, open, tenantId, empresaId]);

  const selecionar = (p: ParceiroFiltroOpcao) => {
    onChange(p.id, p);
    setOpen(false);
    setBusca("");
  };

  const vazio = termo.length < 2
    ? "Digite ao menos 2 caracteres."
    : loading ? "Buscando..." : "Nenhum parceiro encontrado.";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setBusca(""); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Parceiro"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{value ? (label || "Parceiro selecionado") : placeholder}</span>
          <span className="flex shrink-0 items-center gap-1">
            {value && (
              <span
                role="button"
                aria-label="Limpar parceiro"
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null, null);
                }}
              >
                <X size={12} />
              </span>
            )}
            <ChevronDown size={14} className="opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="relative">
            <CommandInput
              placeholder="Razão social, fantasia, CNPJ ou ERP..."
              value={busca}
              onValueChange={setBusca}
              className="h-8 text-xs"
            />
            {loading && (
              <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">{vazio}</CommandEmpty>
            {opcoes.length > 0 && (
              <CommandGroup>
                {opcoes.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={p.id}
                    onSelect={() => selecionar(p)}
                    className="flex cursor-pointer flex-col items-start gap-0 text-xs"
                  >
                    <span className="w-full truncate">
                      {p.razaosocial}
                      {p.nome_fantasia && <span className="text-muted-foreground"> — {p.nome_fantasia}</span>}
                    </span>
                    {(p.cnpj || p.codigo_erp) && (
                      <span className="flex gap-3 text-[10px] text-muted-foreground">
                        {p.cnpj && <span className="font-mono">{p.cnpj}</span>}
                        {p.codigo_erp && <span>ERP: {p.codigo_erp}</span>}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
