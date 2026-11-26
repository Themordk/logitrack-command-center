import { useEffect, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Filter } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { parseDataPura } from "@/utils/dateTime";
import type { DateRange } from "react-day-picker";

export interface FiltersState {
  armazemId: string | null;
  dataIni: string;
  dataFim: string;
  turnoId: string | null;
}

interface Opcao {
  id: string;
  descricao: string;
}

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
  const [armazens, setArmazens] = useState<Opcao[]>([]);
  const [turnos, setTurnos] = useState<Opcao[]>([]);
  const [range, setRange] = useState<DateRange | undefined>({
    // Data pura (AAAA-MM-DD): new Date("AAAA-MM-DD") vira o dia anterior em UTC-3.
    from: parseDataPura(value.dataIni) ?? new Date(),
    to: parseDataPura(value.dataFim) ?? new Date(),
  });
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!tenantId) return;
    let q = supabase.from("armazem").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    q.then(({ data }) => setArmazens((data as Opcao[] | null) || []));
  }, [tenantId, empresaId]);

  useEffect(() => {
    if (!tenantId) return;
    let q = supabase.from("turnos").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (value.armazemId) q = q.eq("armazem_id", value.armazemId);
    q.then(({ data }) => setTurnos((data as Opcao[] | null) || []));
  }, [tenantId, value.armazemId]);

  const applyRange = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from && r?.to) {
      onChange({ ...value, dataIni: format(r.from, "yyyy-MM-dd"), dataFim: format(r.to, "yyyy-MM-dd") });
    }
  };

  const limpar = () => {
    const today = format(new Date(), "yyyy-MM-dd");
    setRange({ from: new Date(), to: new Date() });
    onChange({ armazemId: defaultArmazemId, dataIni: today, dataFim: today, turnoId: null });
  };

  const triggerCls = isMobile ? "w-full h-9" : "h-9";

  const filtrosAtivos =
    !!value.armazemId || !!value.turnoId || value.dataIni !== format(new Date(), "yyyy-MM-dd");

  const campos = (
    <>
      <Select
        value={value.armazemId || "ALL"}
        onValueChange={(v) => onChange({ ...value, armazemId: v === "ALL" ? null : v, turnoId: null })}
      >
        <SelectTrigger className={cn(triggerCls, !isMobile && "w-[200px]")}><SelectValue placeholder="Armazém" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os armazéns</SelectItem>
          {armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "h-9 justify-start text-left font-normal",
              isMobile && "w-full",
              !range && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {range?.from ? (range.to ? `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}` : format(range.from, "dd/MM/yyyy")) : "Período"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="range" selected={range} onSelect={applyRange} numberOfMonths={isMobile ? 1 : 2} initialFocus className={cn("p-3 pointer-events-auto")} />
        </PopoverContent>
      </Popover>

      <Select value={value.turnoId || "ALL"} onValueChange={(v) => onChange({ ...value, turnoId: v === "ALL" ? null : v })}>
        <SelectTrigger className={cn(triggerCls, !isMobile && "w-[180px]")}><SelectValue placeholder="Turno" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os turnos</SelectItem>
          {turnos.map((t) => <SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>)}
        </SelectContent>
      </Select>

      {filtrosAtivos && (
        <Button variant="ghost" size="sm" className={cn(isMobile && "w-full")} onClick={limpar}>
          Limpar filtros
        </Button>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start">
            <Filter className="mr-2 h-4 w-4" aria-hidden="true" />
            Filtros
            {filtrosAtivos && <span className="ml-auto text-caption text-muted-foreground">aplicados</span>}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 mt-4">{campos}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return <div className="flex flex-wrap items-center gap-2">{campos}</div>;
}
