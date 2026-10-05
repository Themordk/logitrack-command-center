import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { GRUPO_NO_UI, TIPO_NO_UI } from "../retornosUi";
import type { Catalogo } from "../retornos.types";
import type { FluxoNode } from "./definicaoRf";
import { nomeTipo } from "./resumoNo";

interface Props {
  no: FluxoNode | null;
  catalogo?: Catalogo;
  somenteLeitura: boolean;
  onFechar: () => void;
  onRenomear: (nome: string) => void;
  onAplicarConfig: (config: Record<string, unknown>) => void;
}

function linhaDoErro(texto: string, msg: string): number {
  const linha = /line (\d+)/i.exec(msg);
  if (linha) return Number(linha[1]);
  const pos = /position (\d+)/i.exec(msg);
  if (pos) return texto.slice(0, Number(pos[1])).split("\n").length;
  return 1;
}

export function NoConfigSheet({ no, catalogo, somenteLeitura, onFechar, onRenomear, onAplicarConfig }: Props) {
  const [nome, setNome] = useState("");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const noId = no?.id;

  useEffect(() => {
    if (!no) return;
    setNome(no.data.nome ?? "");
    setTexto(JSON.stringify(no.data.config ?? {}, null, 2));
    setErro(null);
    // Recarrega só quando outro nó é aberto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noId]);

  const aplicar = () => {
    if (somenteLeitura || !no) return;
    try {
      const v: unknown = JSON.parse(texto);
      if (!v || typeof v !== "object" || Array.isArray(v)) { setErro("A configuração precisa ser um objeto JSON."); return; }
      setErro(null);
      if (JSON.stringify(v) !== JSON.stringify(no.data.config)) onAplicarConfig(v as Record<string, unknown>);
    } catch (e) {
      setErro(`JSON inválido na linha ${linhaDoErro(texto, e instanceof Error ? e.message : "")}`);
    }
  };

  const confirmarNome = () => {
    if (!no || somenteLeitura) return;
    const n = nome.trim();
    if (n !== (no.data.nome ?? "")) onRenomear(n);
  };

  const ui = no ? TIPO_NO_UI[no.data.tipo] : null;
  const Icone = ui?.icone;
  const descricao = no ? catalogo?.nos.find((n) => n.tipo === no.data.tipo)?.descricao : "";

  return (
    <Sheet open={!!no} onOpenChange={(o) => { if (!o) { confirmarNome(); onFechar(); } }}>
      <SheetContent side="right" className="flex w-[480px] flex-col gap-4 sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {Icone && ui && <Icone size={15} className={GRUPO_NO_UI[ui.grupo].icone} aria-hidden />}
            <span className="sr-only">Nome do nó</span>
            <Input
              aria-label="Nome do nó"
              value={nome}
              maxLength={60}
              disabled={somenteLeitura}
              placeholder={no ? nomeTipo(no.data.tipo, catalogo) : ""}
              onChange={(e) => setNome(e.target.value)}
              onBlur={confirmarNome}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarNome(); }}
              className="h-9 rounded-lg bg-secondary/40 text-sm font-semibold"
            />
          </SheetTitle>
          <SheetDescription className="text-xs">{descricao}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-1.5 min-h-0">
          <label htmlFor="no-config-json" className="text-xs uppercase tracking-wide text-muted-foreground">Configuração (JSON)</label>
          <Textarea
            id="no-config-json"
            value={texto}
            disabled={somenteLeitura}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={aplicar}
            spellCheck={false}
            className="min-h-[320px] flex-1 rounded-lg bg-secondary/40 font-mono text-xs"
            aria-invalid={!!erro}
          />
          {erro && <p className="text-xs text-rose-400" role="alert">{erro}</p>}
        </div>
        <SheetFooter className="gap-2">
          {!somenteLeitura && <Button variant="outline" onClick={aplicar}>Aplicar</Button>}
          <Button variant="secondary" onClick={() => { confirmarNome(); onFechar(); }}>Fechar</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
