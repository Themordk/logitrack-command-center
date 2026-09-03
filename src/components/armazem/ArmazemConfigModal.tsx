import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Save, Trash2, MapPin, Settings2, ShieldCheck, BarChart3, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { EnderecoSearchInput } from "./EnderecoSearchInput";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { parseError } from "@/lib/errorMapper";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  open: boolean;
  onClose: () => void;
  armazem: { id: string; descricao: string; empresa_id: string } | null;
}

interface RegraArmazenagem {
  id?: string;
  permite_mistura_sku: boolean;
  permite_mistura_lote: boolean;
  permite_mistura_validade: boolean;
  tolerancia_validade_dias: number;
  usar_cruzamento_curvas: boolean;
  priorizar_consolidacao: boolean;
  
  ativo: boolean;
}

const REGRA_DEFAULTS: RegraArmazenagem = {
  permite_mistura_sku: false,
  permite_mistura_lote: false,
  permite_mistura_validade: false,
  tolerancia_validade_dias: 0,
  usar_cruzamento_curvas: true,
  priorizar_consolidacao: true,
  
  ativo: true,
};

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="inline h-3.5 w-3.5 text-muted-foreground cursor-help ml-1" />
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs text-sm">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function ArmazemConfigModal({ open, onClose, armazem }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Config de endereços
  const [configId, setConfigId] = useState<string | null>(null);
  const [enderecoCancelamentoId, setEnderecoCancelamentoId] = useState<string | null>(null);
  const [enderecoAvariaId, setEnderecoAvariaId] = useState<string | null>(null);
  const [enderecoQuarentenaId, setEnderecoQuarentenaId] = useState<string | null>(null);
  const [enderecoArmazenagemAutomaticaId, setEnderecoArmazenagemAutomaticaId] = useState<string | null>(null);

  // Regras de armazenagem
  const [regra, setRegra] = useState<RegraArmazenagem>(REGRA_DEFAULTS);

  useEffect(() => {
    if (!open || !armazem || !tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [cfgRes, regRes] = await Promise.all([
        (supabase as any)
          .from("armazem_config")
          .select("id, endereco_cancelamento_id, endereco_avaria_id, endereco_quarentena_id, endereco_armazenagem_automatica_id")
          .eq("armazem_id", armazem.id)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
        (supabase as any)
          .from("regra_armazenagem")
          .select("id, permite_mistura_sku, permite_mistura_lote, permite_mistura_validade, tolerancia_validade_dias, usar_cruzamento_curvas, priorizar_consolidacao, ativo")
          .eq("armazem_id", armazem.id)
          .eq("tenant_id", tenantId)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const cfg = cfgRes.data;
      setConfigId(cfg?.id ?? null);
      setEnderecoCancelamentoId(cfg?.endereco_cancelamento_id ?? null);
      setEnderecoAvariaId(cfg?.endereco_avaria_id ?? null);
      setEnderecoQuarentenaId(cfg?.endereco_quarentena_id ?? null);
      setEnderecoArmazenagemAutomaticaId(cfg?.endereco_armazenagem_automatica_id ?? null);

      const reg = regRes.data;
      setRegra(reg ? { ...REGRA_DEFAULTS, ...reg } : { ...REGRA_DEFAULTS });

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, armazem, tenantId]);

  const updateRegra = <K extends keyof RegraArmazenagem>(field: K, value: RegraArmazenagem[K]) => {
    setRegra((r) => ({ ...r, [field]: value }));
  };

  const handleSave = async () => {
    if (!armazem || !tenantId) return;
    setSaving(true);
    try {
      // 1. Salvar armazem_config
      const cfgPayload: any = {
        tenant_id: tenantId,
        empresa_id: armazem.empresa_id,
        armazem_id: armazem.id,
        endereco_cancelamento_id: enderecoCancelamentoId,
        endereco_avaria_id: enderecoAvariaId,
        endereco_quarentena_id: enderecoQuarentenaId,
        endereco_armazenagem_automatica_id: enderecoArmazenagemAutomaticaId,
        ativo: true,
        updated_by: usuarioId,
      };
      if (!configId) cfgPayload.created_by = usuarioId;

      const cfgRes = await (supabase as any)
        .from("armazem_config")
        .upsert(cfgPayload, { onConflict: "tenant_id,armazem_id" })
        .select("id")
        .maybeSingle();
      if (cfgRes.error) throw cfgRes.error;
      if (cfgRes.data?.id) setConfigId(cfgRes.data.id);

      // 2. Salvar regra_armazenagem
      const regPayload: any = {
        tenant_id: tenantId,
        empresa_id: armazem.empresa_id,
        armazem_id: armazem.id,
        permite_mistura_sku: regra.permite_mistura_sku,
        permite_mistura_lote: regra.permite_mistura_lote,
        permite_mistura_validade: regra.permite_mistura_validade,
        tolerancia_validade_dias: regra.tolerancia_validade_dias,
        usar_cruzamento_curvas: regra.usar_cruzamento_curvas,
        priorizar_consolidacao: regra.priorizar_consolidacao,
        tipo_picking_padrao: regra.tipo_picking_padrao,
        ativo: regra.ativo,
        updated_by: usuarioId,
      };
      if (!regra.id) regPayload.created_by = usuarioId;

      if (regra.id) {
        const { error } = await (supabase as any)
          .from("regra_armazenagem")
          .update(regPayload)
          .eq("id", regra.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("regra_armazenagem")
          .insert(regPayload)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (data?.id) setRegra((r) => ({ ...r, id: data.id }));
      }

      toast.success("Configurações salvas com sucesso!");
      onClose();
    } catch (err: any) {
      const p = parseError(err, "armazem-config-modal");
      toast.error((!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao salvar configuração." : p.title);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    if (!armazem || !tenantId) return false;
    setRemoving(true);
    try {
      if (configId) {
        const { error } = await (supabase as any)
          .from("armazem_config")
          .delete()
          .eq("id", configId)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      }
      if (regra.id) {
        const { error } = await (supabase as any)
          .from("regra_armazenagem")
          .delete()
          .eq("id", regra.id)
          .eq("tenant_id", tenantId);
        if (error) throw error;
      }
      toast.success("Configuração removida.");
      setConfigId(null);
      setEnderecoCancelamentoId(null);
      setEnderecoAvariaId(null);
      setEnderecoQuarentenaId(null);
      setEnderecoArmazenagemAutomaticaId(null);
      setRegra({ ...REGRA_DEFAULTS });
      setConfirmRemove(false);
      onClose();
      return true;
    } catch (err: any) {
      const p = parseError(err, "armazem-config-modal");
      toast.error((!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao remover configuração." : p.title);
      return false;
    } finally {
      setRemoving(false);
    }
  };

  const hasAnyRecord = !!configId || !!regra.id;

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <Settings2 size={16} className="text-primary" />
              Configurações do Armazém
            </SheetTitle>
            {armazem && (
              <p className="text-xs text-muted-foreground">{armazem.descricao}</p>
            )}
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
            {loading ? (
              <div className="py-16 flex items-center justify-center text-muted-foreground">
                <Loader2 size={18} className="animate-spin mr-2" /> Carregando...
              </div>
            ) : (
              <>
                {/* Endereços operacionais */}
                <section>
                  <SectionTitle
                    icon={<MapPin size={14} className="text-primary" />}
                    title="Endereços operacionais"
                    subtitle="Endereços padrão usados por rotinas automáticas do armazém"
                  />
                  <div className="grid grid-cols-1 gap-4">
                    <EnderecoSearchInput
                      label="Endereço de Cancelamento"
                      value={enderecoCancelamentoId}
                      onChange={(id) => setEnderecoCancelamentoId(id)}
                      armazemId={armazem?.id ?? null}
                      tenantId={tenantId}
                    />
                    <EnderecoSearchInput
                      label="Endereço de Avaria"
                      value={enderecoAvariaId}
                      onChange={(id) => setEnderecoAvariaId(id)}
                      armazemId={armazem?.id ?? null}
                      tenantId={tenantId}
                    />
                    <EnderecoSearchInput
                      label="Endereço de Quarentena"
                      value={enderecoQuarentenaId}
                      onChange={(id) => setEnderecoQuarentenaId(id)}
                      armazemId={armazem?.id ?? null}
                      tenantId={tenantId}
                    />
                    <EnderecoSearchInput
                      label="Endereço de Armazenagem Automática"
                      value={enderecoArmazenagemAutomaticaId}
                      onChange={(id) => setEnderecoArmazenagemAutomaticaId(id)}
                      armazemId={armazem?.id ?? null}
                      tenantId={tenantId}
                    />
                  </div>
                </section>

                <Separator />

                {/* Regras de mistura */}
                <section>
                  <SectionTitle
                    icon={<ShieldCheck size={14} className="text-primary" />}
                    title="Regras de mistura"
                    subtitle="Controla o que pode coexistir dentro de um mesmo endereço de picking"
                  />
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Permitir mistura de produtos (SKUs)
                          <HelpTip text="Quando ativado, um endereço de picking pode receber mais de um produto diferente." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.permite_mistura_sku ? "Endereços podem ter produtos diferentes" : "Cada endereço aceita apenas um produto"}
                        </p>
                      </div>
                      <Switch checked={regra.permite_mistura_sku} onCheckedChange={(v) => updateRegra("permite_mistura_sku", v)} />
                    </div>

                    <Separator />

                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Permitir mistura de lotes
                          <HelpTip text="Permite que lotes diferentes do mesmo SKU fiquem no mesmo endereço de picking." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.permite_mistura_lote ? "Lotes diferentes podem coexistir" : "Apenas um lote por endereço para o mesmo produto"}
                        </p>
                      </div>
                      <Switch checked={regra.permite_mistura_lote} onCheckedChange={(v) => updateRegra("permite_mistura_lote", v)} />
                    </div>

                    <Separator />

                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Permitir mistura de validades
                          <HelpTip text="Se desativado, a tolerância abaixo define a margem em dias." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.permite_mistura_validade ? "Validades diferentes podem coexistir" : "Validades devem respeitar a tolerância configurada"}
                        </p>
                      </div>
                      <Switch checked={regra.permite_mistura_validade} onCheckedChange={(v) => updateRegra("permite_mistura_validade", v)} />
                    </div>

                    {!regra.permite_mistura_validade && (
                      <div className="pl-4 border-l-2 border-primary/20">
                        <Label className="text-sm font-medium flex items-center">
                          Tolerância de validade (dias)
                          <HelpTip text="Diferença máxima em dias entre validades que podem coexistir. Zero = validades devem ser idênticas." />
                        </Label>
                        <div className="flex items-center gap-3 mt-2">
                          <Input
                            type="number"
                            min={0}
                            max={365}
                            value={regra.tolerancia_validade_dias}
                            onChange={(e) => updateRegra("tolerancia_validade_dias", Math.max(0, parseInt(e.target.value) || 0))}
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
                  </div>
                </section>

                <Separator />

                {/* Motor de sugestão */}
                <section>
                  <SectionTitle
                    icon={<BarChart3 size={14} className="text-primary" />}
                    title="Motor de sugestão"
                    subtitle="Configura como o sistema sugere endereços de picking"
                  />
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Cruzamento de curvas
                          <HelpTip text="Cruza a curva do produto (A/B/C/D) com a curva do endereço para priorizar sugestão." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.usar_cruzamento_curvas ? "Produto curva A → endereço curva A" : "Curvas não influenciam a sugestão"}
                        </p>
                      </div>
                      <Switch checked={regra.usar_cruzamento_curvas} onCheckedChange={(v) => updateRegra("usar_cruzamento_curvas", v)} />
                    </div>

                    <Separator />

                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Priorizar consolidação
                          <HelpTip text="Prioriza endereços onde o produto já está presente." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.priorizar_consolidacao ? "Prioriza endereço onde o SKU já está" : "Não prioriza endereço existente"}
                        </p>
                      </div>
                      <Switch checked={regra.priorizar_consolidacao} onCheckedChange={(v) => updateRegra("priorizar_consolidacao", v)} />
                    </div>

                    <Separator />

                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium flex items-center">
                          Tipo de alocação padrão
                          <HelpTip text="FIXO: endereço reservado ao produto. ROTATIVO: liberado quando saldo zera." />
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.tipo_picking_padrao === "FIXO"
                            ? "Endereço permanece reservado mesmo vazio"
                            : "Endereço liberado quando saldo zera"}
                        </p>
                      </div>
                      <Select
                        value={regra.tipo_picking_padrao}
                        onValueChange={(v) => updateRegra("tipo_picking_padrao", v as "FIXO" | "ROTATIVO")}
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

                    <Separator />

                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-medium">Motor ativo</Label>
                        <p className="text-xs text-muted-foreground">
                          {regra.ativo
                            ? "O motor está ativo e sugere endereços com base nestas regras"
                            : "O motor está inativo — o operador escolherá sem sugestão"}
                        </p>
                      </div>
                      <Switch checked={regra.ativo} onCheckedChange={(v) => updateRegra("ativo", v)} />
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-2">
            <div>
              {hasAnyRecord && !loading && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  disabled={removing}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/40 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={13} /> Remover configuração
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <DeleteConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        description="A configuração e as regras deste armazém serão removidas permanentemente."
      />
    </>
  );
}
