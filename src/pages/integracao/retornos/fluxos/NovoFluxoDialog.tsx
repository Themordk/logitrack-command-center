import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useErpGallery } from "../../useErpGallery";
import { salvarFluxo } from "../retornosService";
import { useCatalogoRetorno } from "../useRetornos";
import type { Definicao, EntidadeDocumento, No } from "../retornos.types";

const MANUAL = "__manual__";
const NENHUM = "__nenhum__";
const rotuloCls = "text-xs uppercase tracking-wide text-muted-foreground";
const inputCls = "h-10 rounded-lg bg-secondary/40";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCriado: (id: string) => void;
}

export function NovoFluxoDialog({ open, onOpenChange, onCriado }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const qc = useQueryClient();
  const catalogo = useCatalogoRetorno();
  const { data: erps } = useErpGallery(tenantId, empresaId, empresaVersion);

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [evento, setEvento] = useState("");
  const [entidadeManual, setEntidadeManual] = useState<EntidadeDocumento>("documento_saida");
  const [erp, setErp] = useState(NENHUM);
  const [salvando, setSalvando] = useState(false);

  const eventos = useMemo(
    () => (catalogo.data?.eventos ?? []).filter((e) => !e.manual && !e.codigo.startsWith("manual.")),
    [catalogo.data],
  );
  const entrada = eventos.filter((e) => e.entidade === "documento_entrada");
  const saida = eventos.filter((e) => e.entidade === "documento_saida");
  const conectados = erps.filter((e) => e.integracao);

  const valido = nome.trim().length > 0 && !!evento;

  function limpar() {
    setNome(""); setDescricao(""); setEvento(""); setEntidadeManual("documento_saida"); setErp(NENHUM);
  }

  async function criar() {
    if (!valido) return;
    setSalvando(true);
    try {
      let gatilho: No;
      if (evento === MANUAL) {
        gatilho = {
          id: "gatilho", tipo: "gatilho.manual", nome: "Manualmente, pelo documento", posicao: { x: 80, y: 200 },
          config: { entidade: entidadeManual, filtros: [], combinador: "e" },
        } as No<"gatilho.manual">;
      } else {
        const ev = eventos.find((e) => e.codigo === evento);
        gatilho = {
          id: "gatilho", tipo: "gatilho.evento", nome: ev?.nome ?? evento, posicao: { x: 80, y: 200 },
          config: { evento, modo: "imediato", filtros: [], combinador: "e" },
        } as No<"gatilho.evento">;
      }
      const definicao: Definicao = { versao_schema: 1, nos: [gatilho], ligacoes: [] };
      const criado = await salvarFluxo(tenantId as string, empresaId as string, {
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        erp_provedor_id: erp === NENHUM ? null : erp,
        definicao,
      });
      await qc.invalidateQueries({ queryKey: ["retorno-fluxos"] });
      toast.success("Fluxo criado.");
      limpar();
      onOpenChange(false);
      onCriado(criado.id);
    } catch (e) {
      toast.error(parseError(e, "Criar fluxo").title);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!salvando) onOpenChange(o); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo fluxo de retorno</DialogTitle>
          <DialogDescription>Escolha quando enviar. Depois você monta o restante no editor.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fluxo-nome" className={rotuloCls}>Nome *</Label>
            <Input id="fluxo-nome" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls}
              placeholder="Ex.: Omie — Pedido expedido" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fluxo-desc" className={rotuloCls}>Descrição</Label>
            <Textarea id="fluxo-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)}
              className="rounded-lg bg-secondary/40 min-h-[64px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fluxo-evento" className={rotuloCls}>Quando enviar *</Label>
            <Select value={evento} onValueChange={setEvento}>
              <SelectTrigger id="fluxo-evento" className={inputCls}>
                <SelectValue placeholder={catalogo.isLoading ? "Carregando…" : "Escolha o evento"} />
              </SelectTrigger>
              <SelectContent>
                {entrada.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Entrada</SelectLabel>
                    {entrada.map((e) => <SelectItem key={e.codigo} value={e.codigo}>{e.nome}</SelectItem>)}
                  </SelectGroup>
                )}
                {saida.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Saída</SelectLabel>
                    {saida.map((e) => <SelectItem key={e.codigo} value={e.codigo}>{e.nome}</SelectItem>)}
                  </SelectGroup>
                )}
                <SelectGroup>
                  <SelectLabel>Outros</SelectLabel>
                  <SelectItem value={MANUAL}>Manualmente, pelo documento</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {evento === MANUAL && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fluxo-entidade" className={rotuloCls}>Tipo de documento</Label>
              <Select value={entidadeManual} onValueChange={(v) => setEntidadeManual(v as EntidadeDocumento)}>
                <SelectTrigger id="fluxo-entidade" className={inputCls}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="documento_entrada">Entrada</SelectItem>
                  <SelectItem value="documento_saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fluxo-erp" className={rotuloCls}>ERP</Label>
            <Select value={erp} onValueChange={setErp}>
              <SelectTrigger id="fluxo-erp" className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {conectados.map((e) => <SelectItem key={e.provedor.id} value={e.provedor.id}>{e.provedor.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!valido || salvando} onClick={criar}>
            {salvando && <Loader2 size={14} className="animate-spin" />} Criar e abrir editor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
