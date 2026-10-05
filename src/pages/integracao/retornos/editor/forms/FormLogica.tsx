import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avaliarFiltros, avaliarRegra } from "../avaliacao";
import type { Combinador, Regra } from "../../retornos.types";
import { Campo, Secao } from "../campos/Campo";
import { RegraBuilder } from "../campos/RegraBuilder";
import { descreverRegra } from "../campos/regras";
import type { FormNoProps } from "./formTypes";

export function ParametrosCondicao(p: FormNoProps) {
  const regras = (p.config.regras as Regra[]) ?? [];
  return (
    <Secao titulo="Regras">
      <RegraBuilder
        regras={regras}
        combinador={(p.config.combinador as Combinador) ?? "e"}
        catalogo={p.catalogo}
        textoVazio="Adicione pelo menos uma regra."
        onChange={(r, cb) => p.alterar({ ...p.config, regras: r, combinador: cb })}
      />
      {!regras.length && <p className="text-xs text-rose-400">A condição precisa de pelo menos uma regra.</p>}
    </Secao>
  );
}

export function ResultadoCondicao(p: FormNoProps) {
  const regras = ((p.config.regras as Regra[]) ?? []).filter((r) => r.campo);
  const cb = (p.config.combinador as Combinador) ?? "e";
  if (!regras.length) return <p className="text-xs text-muted-foreground">Sem regras para avaliar.</p>;
  const ok = avaliarFiltros(regras, cb, p.contexto);
  return (
    <div className="flex flex-col gap-3">
      <p className={ok ? "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400" : "rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-400"}>
        Com a amostra, segue pelo ramo <strong>{ok ? "VERDADEIRO" : "FALSO"}</strong>
      </p>
      <ul className="flex flex-col gap-1.5">
        {regras.map((r, i) => {
          const passa = avaliarRegra(r, p.contexto);
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              {passa ? <Check size={13} className="mt-0.5 text-emerald-400" aria-label="Atende" /> : <X size={13} className="mt-0.5 text-rose-400" aria-label="Não atende" />}
              <span className="font-mono">{descreverRegra(r, p.catalogo)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ParametrosAguardar(p: FormNoProps) {
  const min = Number(p.config.minutos ?? 5);
  const set = (v: number) => p.alterar({ ...p.config, minutos: Math.min(1440, Math.max(1, Math.round(v) || 1)) });
  return (
    <Campo rotulo="Minutos (1–1440)" htmlFor="ag-min">
      <div className="flex items-center gap-2">
        <Input id="ag-min" type="number" min={1} max={1440} disabled={p.somenteLeitura} value={min}
          onChange={(e) => set(Number(e.target.value))} className="h-10 w-28 rounded-lg bg-secondary/40" />
        {[5, 15, 60].map((m) => (
          <Button key={m} type="button" size="sm" variant={min === m ? "secondary" : "outline"} disabled={p.somenteLeitura} onClick={() => set(m)}>{m} min</Button>
        ))}
      </div>
    </Campo>
  );
}

export function ResultadoAguardar(p: FormNoProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>O fluxo continua <strong>{Number(p.config.minutos ?? 0)} min</strong> depois do evento.</p>
      <p className="text-xs text-muted-foreground">Em Simular, a espera é pulada.</p>
    </div>
  );
}
