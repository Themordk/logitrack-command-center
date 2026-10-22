import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  emptyLabel?: string;
  className?: string;
}

/** Combobox com busca para filtros com muitas opções (grupos, marcas...). */
export function SearchableSelectFilter({
  value,
  onChange,
  options,
  placeholder,
  emptyLabel = "Todos",
  className,
}: SearchableSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between gap-2 bg-secondary text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40",
            selected ? "text-foreground" : "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown size={13} className="shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar..." />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__todos__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check size={13} className={cn("mr-2", !value ? "opacity-100" : "opacity-0")} />
                {emptyLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    size={13}
                    className={cn("mr-2", value === o.value ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
