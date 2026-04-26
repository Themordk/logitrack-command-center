import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export interface FiltersState {
  armazemId: string | null;
  dataIni: string;
  dataFim: string;
  turnoId: string | null;
}

const sb = supabase as any;

export function DashboardFilters({
  tenantId,
  empresaId,
  defaultArmazemId,
  value,
  onChange,
}: {
  tenantId: string;
  empresaId?: string | null;
  defaultArmazemId: string | null;
  value: FiltersState;
  onChange: (v: FiltersState) => void;
}) {
  const [armazens, setArmazens] = useState<any[]>([]);
  const [turnos, setTurnos] = useState<any[]>([]);
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(value.dataIni),
    to: new Date(value.dataFim),
  });

  useEffect(() => {
    if (!tenantId) return;
    let q = sb.from("armazem").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    q.then(({ data }: any) => setArmazens(data || []));
  }, [tenantId, empresaId]);

  useEffect(() => {
    if (!tenantId) return;
    let q = sb.from("turnos").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (value.armazemId) q = q.eq("armazem_id", value.armazemId);
    q.then(({ data }: any) => setTurnos(data || []));
  }, [tenantId, value.armazemId]);

  const applyRange = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from && r?.to) {
      onChange({ ...value, dataIni: format(r.from, "yyyy-MM-dd"), dataFim: format(r.to, "yyyy-MM-dd") });
    }
  };

  return (
    <div className="card-surface p-3 flex flex-wrap items-center gap-2">
      <Select
        value={value.armazemId || "ALL"}
        onValueChange={(v) => onChange({ ...value, armazemId: v === "ALL" ? null : v, turnoId: null })}
      >
        <SelectTrigger className="w-[200px] h-9 bg-secondary/40 border-border/50"><SelectValue placeholder="Armazém" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os armazéns</SelectItem>
          {armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn("h-9 justify-start text-left font-normal bg-secondary/40 border-border/50", !range && "text-muted-foreground")}>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {range?.from ? (range.to ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}` : format(range.from, "dd/MM/yyyy")) : "Período"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="range" selected={range} onSelect={applyRange} numberOfMonths={2} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>

      <Select value={value.turnoId || "ALL"} onValueChange={(v) => onChange({ ...value, turnoId: v === "ALL" ? null : v })}>
        <SelectTrigger className="w-[180px] h-9 bg-secondary/40 border-border/50"><SelectValue placeholder="Turno" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os turnos</SelectItem>
          {turnos.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className="h-9 text-xs text-muted-foreground"
        onClick={() => {
          const today = format(new Date(), "yyyy-MM-dd");
          setRange({ from: new Date(), to: new Date() });
          onChange({ armazemId: defaultArmazemId, dataIni: today, dataFim: today, turnoId: null });
        }}
      >
        Limpar
      </Button>
    </div>
  );
}
