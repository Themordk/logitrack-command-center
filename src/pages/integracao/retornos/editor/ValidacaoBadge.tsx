import { AlertTriangle, Check, XCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Aviso, Validacao } from "../retornos.types";

interface Props {
  validacao: Validacao | null | undefined;
  totalNos: number;
  nomeDoNo: (id: string) => string | undefined;
  onSelecionarNo: (id: string) => void;
}

function Item({ a, tipo, nomeDoNo, onSelecionarNo }: { a: Aviso; tipo: "erro" | "aviso" } & Pick<Props, "nomeDoNo" | "onSelecionarNo">) {
  const Icone = tipo === "erro" ? XCircle : AlertTriangle;
  const cor = tipo === "erro" ? "text-rose-400" : "text-amber-400";
  const nome = a.no_id ? nomeDoNo(a.no_id) : undefined;
  const conteudo = (
    <>
      <Icone size={13} className={cn("mt-0.5 shrink-0", cor)} aria-hidden />
      <span className="flex flex-col text-left">
        {nome && <span className="font-semibold text-foreground">{nome}</span>}
        <span className="text-muted-foreground">{a.mensagem}</span>
      </span>
    </>
  );
  if (!a.no_id) return <li className="flex gap-2 px-2 py-1.5 text-xs">{conteudo}</li>;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelecionarNo(a.no_id as string)}
        className="flex w-full gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {conteudo}
      </button>
    </li>
  );
}

export function ValidacaoBadge({ validacao, totalNos, nomeDoNo, onSelecionarNo }: Props) {
  if (!validacao) return null;
  const erros = validacao.erros ?? [];
  const avisos = validacao.avisos ?? [];
  const temErros = erros.length > 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            temErros ? "bg-rose-500/15 text-rose-400 border-rose-500/30" : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
          )}
        >
          {temErros ? <XCircle size={13} aria-hidden /> : <Check size={13} aria-hidden />}
          {temErros ? `${erros.length} ${erros.length === 1 ? "problema" : "problemas"}` : `Válido · 1 gatilho · ${totalNos} nós`}
          {avisos.length > 0 && <span className="text-amber-400">· {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0">
        <div className="max-h-80 overflow-y-auto p-2">
          {!erros.length && !avisos.length && <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum problema encontrado.</p>}
          {erros.length > 0 && (
            <section>
              <h4 className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Erros</h4>
              <ul>{erros.map((a, i) => <Item key={`e${i}`} a={a} tipo="erro" nomeDoNo={nomeDoNo} onSelecionarNo={onSelecionarNo} />)}</ul>
            </section>
          )}
          {avisos.length > 0 && (
            <section>
              <h4 className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Avisos</h4>
              <ul>{avisos.map((a, i) => <Item key={`a${i}`} a={a} tipo="aviso" nomeDoNo={nomeDoNo} onSelecionarNo={onSelecionarNo} />)}</ul>
            </section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
