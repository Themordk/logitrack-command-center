import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
  muted?: boolean;
  suffix?: string;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = "Todos",
  searchPlaceholder = "Buscar...",
  emptyText = "Nenhum item encontrado.",
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");

  const visiveis = options.filter((o) =>
    o.label.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  const selecionarVisiveis = () => {
    const conjunto = new Set(selected);
    visiveis.forEach((o) => conjunto.add(o.value));
    onChange([...conjunto]);
  };

  const rotulo =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={placeholder}
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-xs ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{rotulo}</span>
          <span className="flex shrink-0 items-center gap-1">
            {selected.length > 0 && (
              <span
                role="button"
                aria-label="Limpar seleção"
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange([]);
                }}
              >
                <X size={12} />
              </span>
            )}
            <ChevronDown size={14} className="opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={busca}
            onValueChange={setBusca}
            className="h-8 text-xs"
          />
          <div className="flex items-center gap-3 border-b border-border px-3 py-1.5 text-[11px]">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={selecionarVisiveis}
            >
              Selecionar todos
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onChange([])}
            >
              Limpar
            </button>
          </div>
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">
              {emptyText}
            </CommandEmpty>
            <CommandGroup>
              {visiveis.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  onSelect={() => toggle(o.value)}
                  className="flex cursor-pointer items-center gap-2 text-xs"
                >
                  <Checkbox
                    checked={selected.includes(o.value)}
                    className="pointer-events-none"
                    tabIndex={-1}
                    aria-hidden
                  />
                  <span className={cn("truncate", o.muted && "text-muted-foreground")}>
                    {o.label}
                  </span>
                  {o.suffix && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {o.suffix}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
