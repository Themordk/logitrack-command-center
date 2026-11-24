import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ParceiroFilter } from "../components/ParceiroFilter";
import type { OpcaoFiltro, OpcoesFiltroEntregas } from "./entregas.service";
import type { EntregasFiltrosValor } from "./filtrosEntregas";

export function SelectOpcao({ label, value, onChange, opcoes, todos = "Todos" }: {
  label: string; value: string; onChange: (v: string) => void; opcoes: OpcaoFiltro[]; todos?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={todos} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">{todos}</SelectItem>
          {opcoes.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Período, entregador, veículo e cliente — comuns aos dois relatórios de entrega. */
export function EntregasFiltrosBase({ valor, onChange, opcoes, tenantId, empresaId }: {
  valor: EntregasFiltrosValor;
  onChange: (v: EntregasFiltrosValor) => void;
  opcoes: OpcoesFiltroEntregas;
  tenantId?: string | null;
  empresaId?: string | null;
}) {
  const set = (p: Partial<EntregasFiltrosValor>) => onChange({ ...valor, ...p });
  return (
    <>
      <div className="space-y-1.5">
        <Label className="text-xs">De</Label>
        <Input type="date" className="h-8 text-xs" value={valor.dataInicio} max={valor.dataFim || undefined}
          onChange={(e) => set({ dataInicio: e.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Até</Label>
        <Input type="date" className="h-8 text-xs" value={valor.dataFim} min={valor.dataInicio || undefined}
          onChange={(e) => set({ dataFim: e.target.value })} />
      </div>
      <SelectOpcao label="Entregador" value={valor.usuarioId} onChange={(v) => set({ usuarioId: v })} opcoes={opcoes.entregadores} />
      <SelectOpcao label="Veículo" value={valor.veiculoId} onChange={(v) => set({ veiculoId: v })} opcoes={opcoes.veiculos} />
      <div className="space-y-1.5 lg:col-span-2">
        <Label className="text-xs">Cliente</Label>
        <ParceiroFilter
          value={valor.parceiroId || null}
          label={valor.parceiroNome}
          onChange={(id, p) => set({ parceiroId: id ?? "", parceiroNome: p?.razaosocial ?? "" })}
          tenantId={tenantId}
          empresaId={empresaId}
        />
      </div>
    </>
  );
}
