import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/utils/dateTime";
import {
  ROTULO_NIVEL, ehRetroativa, formatarValor, type NivelRegra, type UnidadeParametro,
} from "./lmsConfig.service";

export interface RegraEmEdicao {
  tipo: "PARAMETRO" | "PADRAO_TEMPO";
  chave: string;
  rotulo: string;
  ajuda?: string;
  unidade: UnidadeParametro | "TEMPO";
  minimo: number;
  maximo: number;
  valorEfetivo: number;
  nivelEfetivo: NivelRegra;
  valorHerdado: number;
  nivelHerdado: NivelRegra;
  temProprio: boolean;
}

interface Props {
  regra: RegraEmEdicao | null;
  nivelTela: "EMPRESA" | "ARMAZEM";
  hoje: string;
  podeRetroativo: boolean;
  salvando: boolean;
  onCancelar: () => void;
  onSalvar: (valor: number | null, vigenteDesde: string, motivo: string) => void;
}

function menosDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d - dias));
  return dt.toISOString().slice(0, 10);
}

export function EditarRegraDialog({ regra, nivelTela, hoje, podeRetroativo, salvando, onCancelar, onSalvar }: Props) {
  const [valor, setValor] = useState("");
  const [herdar, setHerdar] = useState(false);
  const [vigencia, setVigencia] = useState(hoje);
  const [motivo, setMotivo] = useState("");

  useEffect(() => {
    if (!regra) return;
    setValor(String(regra.valorEfetivo ?? ""));
    setHerdar(false);
    setVigencia(hoje);
    setMotivo("");
  }, [regra, hoje]);

  const numero = valor.trim() === "" ? NaN : Number(valor.replace(",", "."));
  const retro = ehRetroativa(vigencia, hoje);
  const minData = podeRetroativo ? menosDias(hoje, 92) : hoje;

  const erro = useMemo(() => {
    if (!regra) return null;
    if (!vigencia || vigencia < minData) {
      return podeRetroativo ? "A data de início pode voltar no máximo 92 dias." : "A data de início não pode ser no passado.";
    }
    if (retro && !motivo.trim()) return "Informe o motivo de uma mudança com data no passado.";
    if (herdar) return null;
    if (!Number.isFinite(numero)) return "Informe um número.";
    if (numero < regra.minimo || numero > regra.maximo) {
      return `Use um valor entre ${formatarValor(regra.minimo, regra.unidade)} e ${formatarValor(regra.maximo, regra.unidade)}.`;
    }
    return null;
  }, [regra, vigencia, minData, podeRetroativo, retro, motivo, herdar, numero]);

  if (!regra) return null;
  const sufixo = regra.unidade === "PERCENTUAL" ? "%" : regra.unidade === "MULTIPLO" ? "×"
    : regra.unidade === "DIAS" ? "dias" : regra.unidade === "QUANTIDADE" ? "execuções" : "segundos";

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !salvando) onCancelar(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{regra.rotulo}</DialogTitle>
          <DialogDescription>
            {nivelTela === "EMPRESA" ? "Vale para todos os armazéns da empresa que não tiverem regra própria." : "Vale só para este armazém."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {regra.ajuda && <p className="text-muted-foreground">{regra.ajuda}</p>}

          <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/30 p-3">
            <div>
              <p className="text-xs text-muted-foreground">Valendo hoje</p>
              <p className="font-semibold text-foreground">{formatarValor(regra.valorEfetivo, regra.unidade)}</p>
              <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[regra.nivelEfetivo]}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sem regra neste nível</p>
              <p className="font-semibold text-foreground">{formatarValor(regra.valorHerdado, regra.unidade)}</p>
              <p className="text-[11px] text-muted-foreground">{ROTULO_NIVEL[regra.nivelHerdado]}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="lms-herdar" checked={herdar} onCheckedChange={(c) => setHerdar(c === true)} />
            <Label htmlFor="lms-herdar" className="font-normal">
              Voltar a herdar ({formatarValor(regra.valorHerdado, regra.unidade)})
            </Label>
          </div>

          {!herdar && (
            <div className="space-y-1.5">
              <Label htmlFor="lms-valor">Novo valor ({sufixo})</Label>
              <Input id="lms-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
              {regra.unidade === "TEMPO" || regra.unidade === "SEGUNDOS" ? (
                Number.isFinite(numero) && <p className="text-xs text-muted-foreground">= {formatarValor(numero, "SEGUNDOS")}</p>
              ) : null}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lms-vigencia">Vale a partir de</Label>
            <Input id="lms-vigencia" type="date" value={vigencia} min={minData} onChange={(e) => setVigencia(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {retro
                ? `Data no passado: depois de salvar, reprocesse a partir de ${formatDate(vigencia)} para os números mudarem.`
                : vigencia > hoje
                  ? `Fica agendada e passa a valer em ${formatDate(vigencia)}.`
                  : "Vale a partir de hoje. Os dias anteriores não mudam."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lms-motivo">Motivo {retro ? "(obrigatório)" : "(opcional)"}</Label>
            <Textarea id="lms-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: novo layout do armazém" />
          </div>

          {erro && <p className="text-xs text-destructive" role="alert">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelar} disabled={salvando}>Cancelar</Button>
          <Button onClick={() => onSalvar(herdar ? null : numero, vigencia, motivo)} disabled={!!erro || salvando}>
            {salvando && <Loader2 size={14} className="mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
