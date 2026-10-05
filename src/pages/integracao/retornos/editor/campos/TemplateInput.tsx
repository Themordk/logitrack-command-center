import { useMemo, useRef, useState } from "react";
import { Braces } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { renderTemplate } from "../avaliacao";
import { MIME_CAMINHO, usePainel } from "./painelContext";

interface Props {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multilinha?: boolean;
  semPrevia?: boolean;
  sugestoes?: string[];
  "aria-label"?: string;
}

export function TemplateInput({ id, value, onChange, placeholder, multilinha, semPrevia, sugestoes, ...rest }: Props) {
  const { caminhos, contexto, somenteLeitura } = usePainel();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const lista = useMemo(() => caminhos.filter((c) => c.toLowerCase().includes(busca.toLowerCase())).slice(0, 50), [caminhos, busca]);

  const inserir = (caminho: string) => {
    const el = ref.current;
    const ini = el?.selectionStart ?? value.length;
    const fim = el?.selectionEnd ?? value.length;
    const trecho = `{{${caminho}}}`;
    onChange(value.slice(0, ini) + trecho + value.slice(fim));
    setAberto(false);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(ini + trecho.length, ini + trecho.length); }, 0);
  };

  const comum = {
    id, ref, value, placeholder, disabled: somenteLeitura, "aria-label": rest["aria-label"],
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes(MIME_CAMINHO)) e.preventDefault(); },
    onDrop: (e: React.DragEvent) => {
      const c = e.dataTransfer.getData(MIME_CAMINHO);
      if (c) { e.preventDefault(); inserir(c); }
    },
    list: sugestoes?.length && id ? `${id}-sug` : undefined,
    className: "rounded-lg bg-secondary/40 font-mono text-xs pr-10",
  };
  const previa = renderTemplate(value, contexto);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        {multilinha ? <Textarea {...comum} rows={3} /> : <Input {...comum} className={`${comum.className} h-9`} />}
        {sugestoes?.length && id ? <datalist id={`${id}-sug`}>{sugestoes.map((s) => <option key={s} value={s} />)}</datalist> : null}
        {!somenteLeitura && (
          <Popover open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setBusca(""); }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button type="button" size="icon" variant="ghost" aria-label="Inserir caminho" className="absolute right-1 top-1 h-7 w-7">
                    <Braces size={13} />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Inserir {"{{caminho}}"}</TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-72 p-2">
              <Input autoFocus aria-label="Buscar caminho" placeholder="Buscar caminho…" value={busca} onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && lista[0]) { e.preventDefault(); inserir(lista[0]); } }}
                className="mb-1 h-8 text-xs bg-secondary/40" />
              <ul className="max-h-56 overflow-y-auto">
                {lista.map((c) => (
                  <li key={c}>
                    <button type="button" onClick={() => inserir(c)} className="w-full truncate rounded px-2 py-1 text-left font-mono text-xs hover:bg-secondary">{c}</button>
                  </li>
                ))}
                {!lista.length && <li className="px-2 py-1 text-xs text-muted-foreground">Nenhum caminho.</li>}
              </ul>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {!semPrevia && value.includes("{{") && (
        <p className="truncate font-mono text-xs text-muted-foreground" title={previa}>→ {previa || "(vazio)"}</p>
      )}
    </div>
  );
}
