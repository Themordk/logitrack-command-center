import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { fetchOptions } from "@/hooks/useCrud";
import { toast } from "sonner";
import { Loader2, Settings2, ShieldCheck, ArrowDownToLine, BarChart3, Info, Warehouse } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RegraArmazenagem {
  id?: string;
  tenant_id: string;
  empresa_id: string;
  armazem_id: string;
  permite_mistura_sku: boolean;
  permite_mistura_lote: boolean;
  permite_mistura_validade: boolean;
  tolerancia_validade_dias: number;
  usar_cruzamento_curvas: boolean;
  priorizar_consolidacao: boolean;
  tipo_picking_padrao: "FIXO" | "ROTATIVO";
  ativo: boolean;
}

const DEFAULTS: Omit<RegraArmazenagem, "tenant_id" | "empresa_id" | "armazem_id"> = {
  permite_mistura_sku: false,
  permite_mistura_lote: false,
  permite_mistura_validade: false,
  tolerancia_validade_dias: 0,
  usar_cruzamento_curvas: true,
  priorizar_consolidacao: true,
  tipo_picking_padrao: "FIXO",
  ativo: true,
};

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="inline h-4 w-4 text-muted-foreground cursor-help ml-1" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-sm">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function RegraArmazenagemPage() {
  const { tenantId, empresaId, armazemId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regra, setRegra] = useState<RegraArmazenagem | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedArmazemId, setSelectedArmazemId] = useState<string | null>(armazemId || null);

  // Carregar lista de armazéns
  useEffect(() => {
    if (!tenantId) return;
    fetchOptions("armazem", tenantId, "descricao").then(setArmazemOptions);
  }, [tenantId]);

  // Carregar regra existente do armazém selecionado
  useEffect(() => {
    if (!tenantId || !selectedArmazemId) {
      setRegra(null);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("regra_armazenagem" as any)
          .select("*")
          .eq("tenant_id", tenantId)
          .eq("armazem_id", selectedArmazemId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setRegra(data as unknown as RegraArmazenagem);
        } else {
          setRegra({
            ...DEFAULTS,
            tenant_id: tenantId,
            empresa_id: empresaId || "",
            armazem_id: selectedArmazemId,
          });
        }
        setHasChanges(false);
      } catch (err: any) {
        toast.error("Erro ao carregar regras: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tenantId, empresaId, selectedArmazemId]);

  const handleArmazemChange = (novoId: string) => {
    if (hasChanges) {
      const ok = window.confirm("Existem alterações não salvas. Deseja descartar e trocar de armazém?");
      if (!ok) return;
    }
    setSelectedArmazemId(novoId);
  };

  const updateField = <K extends keyof RegraArmazenagem>(
    field: K,
    value: RegraArmazenagem[K]
  ) => {
    if (!regra) return;
    setRegra({ ...regra, [field]: value });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!regra || !tenantId || !selectedArmazemId) return;

    setSaving(true);
    try {
      const payload = {
        tenant_id: tenantId,
        empresa_id: empresaId || regra.empresa_id,
        armazem_id: selectedArmazemId,
        permite_mistura_sku: regra.permite_mistura_sku,
        permite_mistura_lote: regra.permite_mistura_lote,
        permite_mistura_validade: regra.permite_mistura_validade,
        tolerancia_validade_dias: regra.tolerancia_validade_dias,
        usar_cruzamento_curvas: regra.usar_cruzamento_curvas,
        priorizar_consolidacao: regra.priorizar_consolidacao,
        tipo_picking_padrao: regra.tipo_picking_padrao,
        ativo: regra.ativo,
      };

      if (regra.id) {
        // Atualizar registro existente
        const { error } = await supabase
          .from("regra_armazenagem" as any)
          .update(payload as any)
          .eq("id", regra.id);

        if (error) throw error;
      } else {
        // Criar novo registro
        const { data, error } = await supabase
          .from("regra_armazenagem" as any)
          .insert(payload as any)
          .select()
          .single();

        if (error) throw error;
        setRegra(data as unknown as RegraArmazenagem);
      }

      setHasChanges(false);
      toast.success("Regras de armazenagem salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            Regras de armazenagem
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure as regras do motor de estratégia de armazenagem por armazém
          </p>
        </div>
        <div className="flex items-center gap-2">
          {regra?.id && (
            <Badge
              variant="outline"
              className={
                regra.ativo
                  ? "bg-green-500/15 text-green-400 border-green-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"
              }
            >
              {regra.ativo ? "Ativo" : "Inativo"}
            </Badge>
          )}
          {regra && !regra.id && (
            <Badge variant="outline" className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
              Não configurado
            </Badge>
          )}
        </div>
      </div>

      {/* Seletor de Armazém */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-primary" />
            Armazém
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Cada armazém possui seu próprio conjunto de regras de armazenagem
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5 flex-1">
              <Label className="text-sm font-medium flex items-center">
                Armazém a configurar
                <HelpTip text="Selecione o armazém cujas regras deseja visualizar ou editar. As regras são armazenadas de forma independente por armazém." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {selectedArmazemId
                  ? "Editando regras do armazém selecionado"
                  : "Selecione um armazém para começar"}
              </p>
            </div>
            <Select value={selectedArmazemId ?? ""} onValueChange={handleArmazemChange}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Selecionar armazém..." />
              </SelectTrigger>
              <SelectContent>
                {armazemOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedArmazemId && (
        <Card className="border-border bg-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Selecione um armazém acima para configurar as regras.
          </CardContent>
        </Card>
      )}

      {selectedArmazemId && loading && (
        <div className="flex justify-center items-center p-12">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      )}

      {selectedArmazemId && !loading && regra && (
      <>

      {/* Seção 1: Regras de Mistura */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Regras de mistura
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Controla o que pode coexistir dentro de um mesmo endereço de picking
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mistura de SKUs */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Permitir mistura de produtos (SKUs)
                <HelpTip text="Quando ativado, um endereço de picking pode receber mais de um produto diferente. Quando desativado, cada endereço aceita apenas um SKU por vez." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.permite_mistura_sku
                  ? "Endereços podem ter produtos diferentes"
                  : "Cada endereço aceita apenas um produto"}
              </p>
            </div>
            <Switch
              checked={regra.permite_mistura_sku}
              onCheckedChange={(v) => updateField("permite_mistura_sku", v)}
            />
          </div>

          <Separator />

          {/* Mistura de Lotes */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Permitir mistura de lotes
                <HelpTip text="Para produtos com controle de lote: permite que lotes diferentes do mesmo SKU fiquem no mesmo endereço de picking." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.permite_mistura_lote
                  ? "Mesmo produto com lotes diferentes pode coexistir"
                  : "Apenas um lote por endereço para o mesmo produto"}
              </p>
            </div>
            <Switch
              checked={regra.permite_mistura_lote}
              onCheckedChange={(v) => updateField("permite_mistura_lote", v)}
            />
          </div>

          <Separator />

          {/* Mistura de Validade */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Permitir mistura de validades
                <HelpTip text="Para produtos com controle de validade: permite que validades diferentes coexistam no endereço. Se desativado, a tolerância abaixo define a margem em dias." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.permite_mistura_validade
                  ? "Validades diferentes podem coexistir"
                  : "Validades devem respeitar a tolerância configurada"}
              </p>
            </div>
            <Switch
              checked={regra.permite_mistura_validade}
              onCheckedChange={(v) => updateField("permite_mistura_validade", v)}
            />
          </div>

          {/* Tolerância de Validade — só visível se mistura de validade está desativada */}
          {!regra.permite_mistura_validade && (
            <div className="pl-4 border-l-2 border-primary/20">
              <Label className="text-sm font-medium flex items-center">
                Tolerância de validade (dias)
                <HelpTip text="Diferença máxima em dias entre validades que podem coexistir. Exemplo: 30 dias significa que lotes com validades que diferem em até 30 dias são aceitos juntos. Zero = validades devem ser idênticas." />
              </Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={regra.tolerancia_validade_dias}
                  onChange={(e) =>
                    updateField("tolerancia_validade_dias", Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  {regra.tolerancia_validade_dias === 0
                    ? "Validades devem ser idênticas"
                    : `Aceita diferença de até ${regra.tolerancia_validade_dias} dias`}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seção 2: Regras de Sugestão */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Motor de sugestão
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Configura como o sistema sugere endereços de picking para os produtos
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Cruzamento de curvas */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Cruzamento de curvas (Velocity-Based Slotting)
                <HelpTip text="Quando ativado, o motor cruza a curva de venda do produto (A/B/C/D) com a curva de acesso do endereço para priorizar a sugestão. Produtos de alta rotação são direcionados para endereços de fácil acesso." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.usar_cruzamento_curvas
                  ? "Produto curva A → prioriza endereço curva A"
                  : "Curvas de venda e acesso não influenciam a sugestão"}
              </p>
            </div>
            <Switch
              checked={regra.usar_cruzamento_curvas}
              onCheckedChange={(v) => updateField("usar_cruzamento_curvas", v)}
            />
          </div>

          <Separator />

          {/* Consolidação */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Priorizar consolidação
                <HelpTip text="Quando ativado, o motor prioriza endereços onde o produto já está presente (picking_produto ativo com espaço disponível). Reduz fragmentação de estoque." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.priorizar_consolidacao
                  ? "Prioriza endereço onde o SKU já está"
                  : "Não prioriza endereço existente do SKU"}
              </p>
            </div>
            <Switch
              checked={regra.priorizar_consolidacao}
              onCheckedChange={(v) => updateField("priorizar_consolidacao", v)}
            />
          </div>

          <Separator />

          {/* Tipo de picking padrão */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium flex items-center">
                Tipo de alocação padrão
                <HelpTip text="FIXO: o endereço fica reservado para o produto mesmo quando vazio — nenhum outro produto pode ser sugerido para ele. ROTATIVO: quando o saldo zera, o endereço volta a ficar disponível para qualquer produto." />
              </Label>
              <p className="text-xs text-muted-foreground">
                {regra.tipo_picking_padrao === "FIXO"
                  ? "Endereço permanece reservado para o produto mesmo quando vazio"
                  : "Endereço liberado quando saldo do produto zera"}
              </p>
            </div>
            <Select
              value={regra.tipo_picking_padrao}
              onValueChange={(v) => updateField("tipo_picking_padrao", v as "FIXO" | "ROTATIVO")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FIXO">Fixo</SelectItem>
                <SelectItem value="ROTATIVO">Rotativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Seção 3: Status e Ação */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <ArrowDownToLine className="h-4 w-4 text-primary" />
            Status do motor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Motor ativo</Label>
              <p className="text-xs text-muted-foreground">
                {regra.ativo
                  ? "O motor está ativo e sugerirá endereços com base nestas regras"
                  : "O motor está inativo — o operador escolherá endereços sem sugestão"}
              </p>
            </div>
            <Switch
              checked={regra.ativo}
              onCheckedChange={(v) => updateField("ativo", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Botão Salvar */}
      <div className="flex justify-end gap-3 pb-6">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="min-w-[140px]"
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" />
              Salvando...
            </>
          ) : (
            "Salvar regras"
          )}
        </Button>
      </div>
      </>
      )}
    </div>
  );
}
