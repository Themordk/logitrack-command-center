import { useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { avaliarRegra, obterCaminho } from "../avaliacao";
import type { Catalogo, Combinador, Operador, Regra } from "../../retornos.types";
import { CaminhoInput } from "./CaminhoInput";
import { usePainel } from "./painelContext";

import { SEM_VALOR } from "./regras";
const LISTA: Operador[] = ["em", "nao_em"];
const NUMERICO: Operador[] = ["maior", "maior_igual", "menor", "menor_igual"];

function Chips({ valor, onChange, disabled }: { valor: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [txt, setTxt] = useState("");
  const add = () => {
    const novos = txt.split(",").map((s) => s.trim()).filter((s) => s && !valor.includes(s));
    if (novos.length) onChange([...valor, ...novos]);
    setTxt("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-input bg-secondary/40 px-2 py-1">
      {valor.map((v) => (
        <Badge key={v} variant="outline" className="gap-1 font-mono text-[11px]">
          {v}
          {!disabled && (
            <button type="button" aria-label={`Remover ${v}`} onClick={() => onChange(valor.filter((x) => x !== v))}><X size={10} /></button>
          )}
        </Badge>
      ))}
      <input
        aria-label="Adicionar valor"
        disabled={disabled}
        value={txt}
        placeholder={valor.length ? "" : "valor e Enter"}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
        onBlur={add}
        className="min-w-[60px] flex-1 bg-transparent font-mono text-xs focus:outline-none"
      />
    </div>
  );
}

interface Props {
  regras: Regra[];
  combinador: Combinador;
  catalogo?: Catalogo;
  onChange: (regras: Regra[], combinador: Combinador) => void;
  textoVazio?: string;
}

export function RegraBuilder({ regras, combinador, catalogo, onChange, textoVazio = "Nenhuma regra." }: Props) {
  const { contexto, somenteLeitura } = usePainel();
  const set = (i: number, r: Regra) => onChange(regras.map((x, j) => (j === i ? r : x)), combinador);

  const trocarOperador = (i: number, r: Regra, op: Operador) => {
    const nova: Regra = { campo: r.campo, operador: op };
    if (LISTA.includes(op)) nova.valor = Array.isArray(r.valor) ? r.valor : r.valor !== undefined && r.valor !== "" ? [String(r.valor)] : [];
    else if (!SEM_VALOR.includes(op)) nova.valor = Array.isArray(r.valor) ? r.valor.join(",") : r.valor ?? "";
    set(i, nova);
  };

  return (
    <div className="flex flex-col gap-2">
      <Select value={combinador} disabled={somenteLeitura} onValueChange={(v) => onChange(regras, v as Combinador)}>
        <SelectTrigger aria-label="Combinador" className="h-8 w-56 rounded-lg bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="e">Todas as regras (E)</SelectItem>
          <SelectItem value="ou">Qualquer regra (OU)</SelectItem>
        </SelectContent>
      </Select>
      {!regras.length && <p className="text-xs text-muted-foreground">{textoVazio}</p>}
      {regras.map((r, i) => {
        const passa = r.campo ? avaliarRegra(r, contexto) : null;
        const amostra = r.campo ? obterCaminho(contexto, r.campo) : undefined;
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="grid flex-1 grid-cols-[1.4fr_1fr_1.2fr] gap-2">
              <CaminhoInput aria-label={`Campo da regra ${i + 1}`} value={r.campo} onChange={(c) => set(i, { ...r, campo: c })} />
              <Select value={r.operador} disabled={somenteLeitura} onValueChange={(v) => trocarOperador(i, r, v as Operador)}>
                <SelectTrigger aria-label={`Operador da regra ${i + 1}`} className="h-9 rounded-lg bg-secondary/40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(catalogo?.operadores ?? []).map((o) => <SelectItem key={o.codigo} value={o.codigo}>{o.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {SEM_VALOR.includes(r.operador) ? <div /> : LISTA.includes(r.operador) ? (
                <Chips
                  disabled={somenteLeitura}
                  valor={Array.isArray(r.valor) ? r.valor : r.valor !== undefined && r.valor !== "" ? String(r.valor).split(",").map((s) => s.trim()) : []}
                  onChange={(v) => set(i, { ...r, valor: v })}
                />
              ) : typeof amostra === "boolean" ? (
                <Select value={String(r.valor ?? "")} disabled={somenteLeitura} onValueChange={(v) => set(i, { ...r, valor: v === "true" })}>
                  <SelectTrigger aria-label={`Valor da regra ${i + 1}`} className="h-9 rounded-lg bg-secondary/40 text-xs"><SelectValue placeholder="Escolha" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">verdadeiro</SelectItem>
                    <SelectItem value="false">falso</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  aria-label={`Valor da regra ${i + 1}`}
                  type={NUMERICO.includes(r.operador) ? "number" : "text"}
                  disabled={somenteLeitura}
                  value={Array.isArray(r.valor) ? r.valor.join(",") : String(r.valor ?? "")}
                  onChange={(e) => set(i, { ...r, valor: NUMERICO.includes(r.operador) && e.target.value !== "" ? Number(e.target.value) : e.target.value })}
                  className="h-9 rounded-lg bg-secondary/40 font-mono text-xs"
                />
              )}
            </div>
            <span className="mt-2.5 w-4 shrink-0" aria-label={passa === null ? undefined : passa ? "Atende na amostra" : "Não atende na amostra"}>
              {passa === true && <Check size={14} className="text-emerald-400" aria-hidden />}
              {passa === false && <X size={14} className="text-rose-400" aria-hidden />}
            </span>
            {!somenteLeitura && (
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9" aria-label={`Remover regra ${i + 1}`}
                onClick={() => onChange(regras.filter((_, j) => j !== i), combinador)}>
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        );
      })}
      {!somenteLeitura && (
        <Button type="button" size="sm" variant="ghost" className="self-start gap-1.5 text-primary"
          onClick={() => onChange([...regras, { campo: "", operador: "igual", valor: "" }], combinador)}>
          <Plus size={13} /> Adicionar regra
        </Button>
      )}
    </div>
  );
}
