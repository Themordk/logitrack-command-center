import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, MapPin, Radio, UsersRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { listarOperadoresElegiveis } from "@/lib/responsaveisOndaService";
import type { EtapaOnda } from "@/lib/responsaveisOnda.types";

interface Props {
  movimentoSaidaId: string;
  etapa: EtapaOnda;
  selecionados: string[];
  /** Nomes já conhecidos (convocados gravados), para o rótulo antes de carregar a lista. */
  nomesConhecidos: Record<string, string>;
  disabled?: boolean;
  onChange: (usuarios: string[], nomes: Record<string, string>) => void;
}

const LIVRE = "__livre__";

/**
 * Escolha de quem a etapa convoca.
 * EXCLUSIVA (reserva total) = um responsável; COMPARTILHADA = equipe (vários).
 * "Livre (autoconvocação)" limpa a convocação: qualquer habilitado pode assumir pelo coletor.
 * Quem não pode ser convocado aparece desabilitado com o motivo devolvido pelo banco.
 */
export function SeletorConvocados({ movimentoSaidaId, etapa, selecionados, nomesConhecidos, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const exclusiva = etapa.modo === "EXCLUSIVA";

  const elegiveisQuery = useQuery({
    queryKey: ["onda-elegiveis", movimentoSaidaId, etapa.tipo_tarefa_id],
    queryFn: () => listarOperadoresElegiveis(movimentoSaidaId, etapa.tipo_tarefa_id),
    enabled: open,
    staleTime: 30_000,
  });
  const elegiveis = elegiveisQuery.data ?? [];

  const nomes: Record<string, string> = { ...nomesConhecidos };
  elegiveis.forEach((e) => { nomes[e.usuario_id] = e.nome; });

  const rotulo =
    selecionados.length === 0
      ? "Livre (autoconvocação)"
      : selecionados.length === 1
        ? nomes[selecionados[0]] ?? "1 operador"
        : `${nomes[selecionados[0]] ?? "Operador"} +${selecionados.length - 1}`;

  const alternar = (usuarioId: string) => {
    if (usuarioId === LIVRE) {
      onChange([], nomes);
      if (exclusiva) setOpen(false);
      return;
    }
    if (exclusiva) {
      onChange([usuarioId], nomes);
      setOpen(false);
      return;
    }
    onChange(
      selecionados.includes(usuarioId) ? selecionados.filter((id) => id !== usuarioId) : [...selecionados, usuarioId],
      nomes,
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Escolher ${exclusiva ? "responsável" : "equipe"} da etapa ${etapa.nome}`}
          className={cn(
            "w-full h-10 px-3 rounded-lg border text-sm flex items-center justify-between gap-2 text-left",
            "border-border bg-secondary/40 hover:bg-secondary/60 disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <span className={cn("truncate", selecionados.length === 0 && "text-muted-foreground")}>{rotulo}</span>
          <ChevronDown size={14} className="shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Buscar operador..." />
          <CommandList className="max-h-72">
            {elegiveisQuery.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>Nenhum operador encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="livre autoconvocacao" onSelect={() => alternar(LIVRE)}>
                    <Check size={14} className={cn("mr-2", selecionados.length === 0 ? "opacity-100" : "opacity-0")} />
                    <div className="flex flex-col">
                      <span>Livre (autoconvocação)</span>
                      <span className="text-[11px] text-muted-foreground">Qualquer operador habilitado assume pelo coletor</span>
                    </div>
                  </CommandItem>
                </CommandGroup>
                <CommandGroup heading={exclusiva ? "Responsável (um só)" : "Equipe (vários)"}>
                  {elegiveis.map((op) => {
                    const marcado = selecionados.includes(op.usuario_id);
                    return (
                      <CommandItem
                        key={op.usuario_id}
                        value={`${op.nome} ${op.login}`}
                        disabled={!op.elegivel}
                        onSelect={() => op.elegivel && alternar(op.usuario_id)}
                        className="items-start"
                      >
                        <Check size={14} className={cn("mr-2 mt-0.5", marcado ? "opacity-100" : "opacity-0")} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate">{op.nome}</span>
                          {op.elegivel ? (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
                              {op.funcao_igual_etapa && <span className="text-primary">Função principal</span>}
                              {op.logado && (
                                <span className="flex items-center gap-0.5 text-green-400"><Radio size={10} /> Online</span>
                              )}
                              {op.zona && <span className="flex items-center gap-0.5"><MapPin size={10} /> {op.zona}</span>}
                              <span className="flex items-center gap-0.5"><UsersRound size={10} /> {op.tarefas_abertas} aberta(s)</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-orange-400">{op.mensagem}</span>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
