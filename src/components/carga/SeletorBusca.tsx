/**
 * Seleção com busca por nome nos campos da montagem de carga (veículo, transportadora, box).
 * Reaproveita o SearchableSelectFilter (Popover + Command) com o visual dos campos de formulário.
 */
import { SearchableSelectFilter, type SearchableSelectOption } from "@/components/filters/SearchableSelectFilter";

interface Props {
  id: string;
  /** "" = nada escolhido. */
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Texto exibido quando nada está escolhido (e da opção vazia, se houver). */
  vazio: string;
  /** Mostra a opção vazia na lista (ex.: "Sem box", "Usar o veículo das ondas"). */
  permitirVazio?: boolean;
  searchPlaceholder: string;
  disabled?: boolean;
}

export function SeletorBusca({ id, value, onChange, options, vazio, permitirVazio = true, searchPlaceholder, disabled }: Props) {
  return (
    <SearchableSelectFilter
      id={id}
      value={value || null}
      onChange={(v) => onChange(v ?? "")}
      options={options}
      placeholder={vazio}
      emptyLabel={vazio}
      allowEmpty={permitirVazio}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled}
      className="w-full h-10 font-normal border-border bg-secondary/40 hover:bg-secondary/60"
      contentClassName="w-[var(--radix-popover-trigger-width)] min-w-64"
    />
  );
}
