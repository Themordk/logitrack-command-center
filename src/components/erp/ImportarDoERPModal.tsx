import { ReactNode, useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Search,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

export type ImportEntidade =
  | "produto"
  | "parceiro"
  | "nota_entrada"
  | "pedido_saida"
  | "grupo_produto"
  | "redirect_sync";

export interface ImportarDoERPConfig {
  titulo: string;
  icone?: ReactNode;
  labelCampo: string;
  placeholderCampo: string;
  tipoCampo: "text" | "number";
  entidade: ImportEntidade;
  camposPrevia?: Array<{ label: string; campo: string }>;
  /** Para 'redirect_sync' — texto da mensagem informativa */
  mensagemRedirect?: string;
  /** Caminho alvo do botão "Ver registro" (recebe o id retornado) */
  verRegistroPath?: (id: string) => string;
  /** Empresa label exibida na confirmação */
  empresaLabel?: string;
  /** Aviso adicional renderizado na tela de prévia */
  avisoConfirmacao?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (registro: any) => void;
  config: ImportarDoERPConfig;
}

type Estado = "BUSCA" | "BUSCANDO" | "PREVIA" | "IMPORTANDO" | "SUCESSO" | "ERRO";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
void sleep;

export function ImportarDoERPModal({ isOpen, onClose, onSuccess, config }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [estado, setEstado] = useState<Estado>("BUSCA");
  const [valor, setValor] = useState("");
  const [registro, setRegistro] = useState<any>(null);
  const [erro, setErro] = useState<string>("");

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setEstado("BUSCA");
        setValor("");
        setRegistro(null);
        setErro("");
      }, 200);
    }
  }, [isOpen]);

  const handleClose = () => {
    onClose();
  };

  const handleBuscar = async () => {
    if (!valor.trim()) {
      toast.error(`Informe ${config.labelCampo}`);
      return;
    }
    if (!tenantId || !empresaId) {
      toast.error("Tenant/Empresa não definidos");
      return;
    }

    setEstado("BUSCANDO");
    setErro("");

    try {
      if (config.entidade === "produto") {
        const { data: req, error } = await (supabase as any).rpc("middleware_consultar_produto_omie", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_codigo_produto: null,
          p_codigo: valor.trim(),
        });
        if (error) throw new Error(error.message);
        const requestId = typeof req === "object" ? req?.request_id ?? req : req;
        await sleep(3000);
        const data = await pollProcessar("middleware_processar_produto_omie", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_request_id: requestId,
        });
        setRegistro(data);
        setEstado("PREVIA");
      } else if (config.entidade === "parceiro") {
        const { data: req, error } = await (supabase as any).rpc("middleware_consultar_parceiro_omie", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_codigo_cliente_omie: parseInt(valor.trim(), 10) || null,
          p_codigo_integracao: null,
        });
        if (error) throw new Error(error.message);
        const requestId = typeof req === "object" ? req?.request_id ?? req : req;
        await sleep(3000);
        const data = await pollProcessar("middleware_processar_parceiro_omie", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_request_id: requestId,
        });
        setRegistro(data);
        setEstado("PREVIA");
      } else if (config.entidade === "nota_entrada") {
        const v = valor.trim();
        const body: any = { tenant_id: tenantId, empresa_id: empresaId };
        if (v.length === 44) body.chave_nfe = v;
        else body.numero_nota = v;

        const isNotFound = (errMsg?: string, data?: any) => {
          if (data?.sucesso === false) return true;
          const m = (errMsg || "").toLowerCase();
          return m.includes("não encontrad") || m.includes("nao encontrad") || m.includes("not found") || m.includes("404");
        };

        // Passo 1: sync-recebimentos (compra/revenda - prioritário)
        const r1 = await supabase.functions.invoke("sync-recebimentos", { body });
        if (!r1.error && r1.data?.sucesso === true) {
          setRegistro({ ...r1.data, _origem: "recebimento" });
          setEstado("PREVIA");
          return;
        }
        // Erro real (não "não encontrado") → interrompe sem fallback
        if (r1.error && !isNotFound(r1.error.message, r1.data)) {
          throw new Error(r1.error.message || "Falha ao consultar recebimentos");
        }
        const erroRecebimento = r1.data?.erro || r1.error?.message || "não encontrado";

        // Passo 2: sync-notas-entrada (NF-e de entrada - fallback)
        const r2 = await supabase.functions.invoke("sync-notas-entrada", { body });
        if (!r2.error && r2.data?.sucesso === true) {
          setRegistro({ ...r2.data, _origem: "nota_entrada" });
          setEstado("PREVIA");
          return;
        }
        if (r2.error && !isNotFound(r2.error.message, r2.data)) {
          throw new Error(r2.error.message || "Falha ao consultar notas de entrada");
        }
        const erroNota = r2.data?.erro || r2.error?.message || "não encontrado";

        throw new Error(
          `Documento não encontrado no ERP (Recebimentos: ${erroRecebimento}; Notas de Entrada: ${erroNota}).`,
        );
      } else if (config.entidade === "pedido_saida") {
        const v = valor.trim();
        const body = { tenant_id: tenantId, empresa_id: empresaId, numero_pedido: v };
        const { data, error } = await supabase.functions.invoke("sync-pedidos-saida", { body });
        if (error) throw new Error(error.message || "Falha ao consultar pedidos");
        const res = data?.results?.[0] || data || {};
        const importados = Number(res.pedidos_importados || 0);
        const ignorados = Number(res.ignorados || 0);
        const erros = Number(res.erros || 0);

        if (importados === 0 && ignorados === 0) {
          throw new Error(res.mensagem || res.erro || (erros > 0 ? "Erro ao importar pedido" : "Pedido não encontrado no ERP"));
        }

        // Buscar documento recém criado/existente
        const { data: doc } = await (supabase as any)
          .from("documento_saida")
          .select("id, numero_pedido, parceiro_nome, data_previsao, valor_total, qtd_itens, rota_nome")
          .eq("empresa_id", empresaId)
          .eq("numero_pedido", v)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        setRegistro({ ...(doc || { numero_pedido: v }), _jaExistia: importados === 0 && ignorados > 0 });
        setEstado("PREVIA");
      } else if (config.entidade === "grupo_produto") {
        const codigo = parseInt(valor.trim(), 10);
        if (!codigo) throw new Error("Código do grupo inválido");

        // Verificar se já existe no WMS
        const { data: existente } = await (supabase as any)
          .from("grupo_produto")
          .select("id, descricao, codigo_erp, ativo")
          .eq("empresa_id", empresaId)
          .eq("codigo_erp", String(codigo))
          .maybeSingle();

        const body = { tenant_id: tenantId, empresa_id: empresaId, codigo_grupo: codigo };
        const { data, error } = await supabase.functions.invoke("sync-grupo-produto", { body });
        if (error) throw new Error(error.message || "Falha ao consultar grupo");
        if (data?.sucesso === false) throw new Error(data?.erro || "Grupo não encontrado no ERP");

        // Recarregar registro do WMS pós-sync
        const { data: pos } = await (supabase as any)
          .from("grupo_produto")
          .select("id, descricao, codigo_erp, ativo")
          .eq("empresa_id", empresaId)
          .eq("codigo_erp", String(codigo))
          .maybeSingle();

        setRegistro({ ...(pos || data || {}), _jaExistia: !!existente });
        setEstado("PREVIA");
      }
    } catch (e: any) {
      setErro(e?.message || "Erro desconhecido");
      setEstado("ERRO");
    }
  };

  const handleConfirmar = async () => {
    setEstado("IMPORTANDO");
    try {
      // produto/parceiro: o processar já gravou; apenas confirmar.
      // nota_entrada/pedido_saida: a edge function de sync já gravou também.
      onSuccess(registro);
      setEstado("SUCESSO");
    } catch (e: any) {
      setErro(e?.message || "Erro ao importar");
      setEstado("ERRO");
    }
  };

  const goRedirectSync = () => {
    window.location.hash = "#/configuracoes/integracao-erp?aba=sincronizacao";
    handleClose();
  };

  const goVerRegistro = () => {
    const id = registro?.produto_id || registro?.parceiro_id || registro?.documento_id || registro?.id;
    if (config.verRegistroPath && id) {
      window.location.hash = "#" + config.verRegistroPath(id);
    }
    handleClose();
  };

  const renderHeader = (icon: ReactNode, titulo: string) => (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-primary">{icon}</div>
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
    </div>
  );

  const renderBusca = () => (
    <>
      {renderHeader(<ArrowDownToLine size={20} />, config.titulo)}
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/40 border border-border">
          <div className="text-primary">{config.icone || <ArrowDownToLine size={28} />}</div>
          <p className="text-sm text-muted-foreground">
            Informe {config.labelCampo} para buscar no ERP Omie
          </p>
        </div>
        <div className="space-y-2">
          <Label>{config.labelCampo}</Label>
          <Input
            type={config.tipoCampo}
            placeholder={config.placeholderCampo}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBuscar();
              }
            }}
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleBuscar}>
            <Search size={14} /> Buscar no ERP <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </>
  );

  const renderBuscando = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Consultando ERP Omie...</p>
    </div>
  );

  const renderPrevia = () => {
    const jaExistia = !!registro?._jaExistia;
    return (
    <>
      {renderHeader(<CheckCircle2 size={20} className="text-emerald-500" />, "Registro encontrado")}
      <div className="space-y-4">
        {jaExistia && (
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle size={12} /> Já cadastrado
          </div>
        )}
        <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2">
          {(config.camposPrevia || []).map((c) => {
            const v = registro?.[c.campo];
            const display =
              c.campo === "ativo"
                ? v ? "● Ativo" : "○ Inativo"
                : v ?? "—";
            return (
              <div key={c.campo} className="flex items-start justify-between gap-4 text-sm">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="text-foreground font-medium text-right">{String(display)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            {config.avisoConfirmacao ||
              `Este registro será importado para a empresa ${config.empresaLabel || "ativa"}.`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => setEstado("BUSCA")}>
            <ArrowLeft size={14} /> Buscar outro
          </Button>
          <Button onClick={handleConfirmar}>
            <CheckCircle2 size={14} /> {jaExistia ? "Atualizar" : "Confirmar"}
          </Button>
        </div>
      </div>
    </>
    );
  };

  const renderImportando = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Importando...</p>
    </div>
  );

  const renderSucesso = () => {
    const nome =
      registro?.descricao || registro?.razao_social ||
      registro?.numero_nota || registro?.numero_pedido || "Registro";
    return (
      <>
        {renderHeader(<CheckCircle2 size={20} className="text-emerald-500" />, "Importado com sucesso!")}
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{nome}</span> foi importado para o sistema.
          </p>
          <div className="flex items-center justify-between gap-2 pt-2">
            <Button variant="outline" onClick={() => { setEstado("BUSCA"); setValor(""); setRegistro(null); }}>
              Importar outro
            </Button>
            {config.verRegistroPath && (
              <Button onClick={goVerRegistro}>
                Ver registro <ExternalLink size={14} />
              </Button>
            )}
            {!config.verRegistroPath && (
              <Button onClick={handleClose}>Fechar</Button>
            )}
          </div>
        </div>
      </>
    );
  };

  const renderErro = () => (
    <>
      {renderHeader(<XCircle size={20} className="text-destructive" />, "Erro na importação")}
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {erro || "Erro desconhecido"}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => setEstado("BUSCA")}>
            <ArrowLeft size={14} /> Tentar novamente
          </Button>
          <Button variant="secondary" onClick={handleClose}>Fechar</Button>
        </div>
      </div>
    </>
  );

  const renderRedirect = () => (
    <>
      {renderHeader(<ArrowDownToLine size={20} />, config.titulo)}
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-secondary/40 border border-border text-sm text-muted-foreground">
          {config.mensagemRedirect}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>Fechar</Button>
          <Button onClick={goRedirectSync}>
            Ir para Sincronização <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-md">
        {config.entidade === "redirect_sync"
          ? renderRedirect()
          : estado === "BUSCA"
          ? renderBusca()
          : estado === "BUSCANDO"
          ? renderBuscando()
          : estado === "PREVIA"
          ? renderPrevia()
          : estado === "IMPORTANDO"
          ? renderImportando()
          : estado === "SUCESSO"
          ? renderSucesso()
          : renderErro()}
      </DialogContent>
    </Dialog>
  );
}

interface BotaoProps {
  onClick: () => void;
  label?: string;
}

export function BotaoImportarERP({ onClick, label = "Importar do ERP" }: BotaoProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
    >
      <ArrowDownToLine size={14} />
      {label}
    </button>
  );
}
