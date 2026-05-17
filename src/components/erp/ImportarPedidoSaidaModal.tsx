import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowDownToLine,
  ArrowLeft,
  CheckCircle2,
  Info,
  Loader2,
  Search,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type Estado = "IDLE" | "BUSCANDO" | "SUCESSO" | "JA_IMPORTADA" | "NAO_ENCONTRADO" | "ERRO";

interface Resultado {
  status?: string;
  documento_id?: string;
  numero_pedido?: string | number;
  cliente?: string;
  valor_pedido?: number;
  etapa?: string;
  itens_importados?: number;
  itens_nao_resolvidos?: number;
  message?: string;
}

export function ImportarPedidoSaidaModal({ isOpen, onClose, onSuccess }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [estado, setEstado] = useState<Estado>("IDLE");
  const [valor, setValor] = useState("");
  const [erroValidacao, setErroValidacao] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setEstado("IDLE");
        setValor("");
        setErroValidacao("");
        setResultado(null);
      }, 200);
    }
  }, [isOpen]);

  const handleChange = (v: string) => {
    setValor(v.replace(/\D/g, ""));
    if (erroValidacao) setErroValidacao("");
  };

  const handleBuscar = async () => {
    const num = parseInt(valor, 10);
    if (!valor.trim() || isNaN(num) || num <= 0) {
      setErroValidacao("Informe um número de pedido válido.");
      return;
    }
    if (!tenantId || !empresaId) {
      setResultado({ message: "Tenant/Empresa não definidos." });
      setEstado("ERRO");
      return;
    }
    setEstado("BUSCANDO");
    try {
      const { data, error } = await supabase.functions.invoke("sync-pedidos-saida", {
        body: { tenant_id: tenantId, empresa_id: empresaId, numero_pedido: num },
      });
      if (error) {
        setResultado({ message: error.message || "Erro ao consultar pedido" });
        setEstado("ERRO");
        return;
      }
      const r = (data || {}) as Resultado;
      setResultado(r);
      if (r.status === "success") {
        setEstado("SUCESSO");
        onSuccess();
      } else if (r.status === "already_imported") {
        setEstado("JA_IMPORTADA");
        onSuccess();
      } else if (r.status === "not_found") {
        setEstado("NAO_ENCONTRADO");
      } else {
        setEstado("ERRO");
      }
    } catch (e: any) {
      setResultado({ message: e?.message || "Erro desconhecido" });
      setEstado("ERRO");
    }
  };

  const handleVerDocumento = () => {
    const id = resultado?.documento_id;
    if (id) {
      window.location.hash = `#/atividades/saidas?documento_id=${id}`;
    }
    onClose();
  };

  const handleImportarOutro = () => {
    setValor("");
    setResultado(null);
    setErroValidacao("");
    setEstado("IDLE");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleTentarNovamente = () => {
    setResultado(null);
    setEstado("IDLE");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const renderHeader = (icon: React.ReactNode, titulo: string) => (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-primary">{icon}</div>
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
    </div>
  );

  const formatBRL = (v?: number) =>
    typeof v === "number"
      ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";

  const renderIdle = () => (
    <>
      {renderHeader(<ArrowDownToLine size={20} />, "Importar Pedido de Venda do ERP")}
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/40 border border-border">
          <div className="text-primary"><ArrowDownToLine size={28} /></div>
          <p className="text-sm text-muted-foreground">
            Informe o número do pedido de venda para importar do ERP Omie.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Número do pedido de venda</Label>
          <Input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="Ex: 42"
            value={valor}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBuscar();
              }
            }}
            autoFocus
          />
          {erroValidacao && (
            <p className="text-xs text-destructive">{erroValidacao}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleBuscar} disabled={!valor || parseInt(valor, 10) <= 0}>
            <Search size={14} /> Buscar e Importar
          </Button>
        </div>
      </div>
    </>
  );

  const renderBuscando = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Consultando pedido no ERP Omie...</p>
    </div>
  );

  const renderSucesso = () => (
    <>
      {renderHeader(<CheckCircle2 size={20} className="text-emerald-500" />, "Importação concluída")}
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2">
          <p className="text-sm text-foreground">
            Pedido nº <span className="font-semibold">{resultado?.numero_pedido}</span> importado com sucesso!
          </p>
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="flex justify-between gap-4">
              <span>Cliente</span>
              <span className="text-foreground text-right">{resultado?.cliente || "—"}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Valor</span>
              <span className="text-foreground font-mono">{formatBRL(resultado?.valor_pedido)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Itens importados</span>
              <span className="text-foreground">{resultado?.itens_importados ?? 0}</span>
            </div>
          </div>
        </div>
        {resultado?.etapa && resultado.etapa !== "30" && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
            <Info size={14} className="shrink-0 mt-0.5" />
            <span>
              Este pedido está na etapa {resultado.etapa} no ERP e foi importado manualmente.
            </span>
          </div>
        )}
        {(resultado?.itens_nao_resolvidos ?? 0) > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {resultado?.itens_nao_resolvidos} item(ns) não resolvido(s) — produto sem vínculo no ERP Omie.
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={handleImportarOutro}>
            Importar outro pedido
          </Button>
          <Button onClick={handleVerDocumento} disabled={!resultado?.documento_id}>
            Ver documento de saída <ExternalLink size={14} />
          </Button>
        </div>
      </div>
    </>
  );

  const renderJaImportada = () => (
    <>
      {renderHeader(<Info size={20} className="text-blue-400" />, "Pedido já importado")}
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-foreground">
          {resultado?.message || "Este pedido já foi importado anteriormente."}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={handleImportarOutro}>
            <ArrowLeft size={14} /> Importar outro
          </Button>
          <Button onClick={handleVerDocumento} disabled={!resultado?.documento_id}>
            Ver documento <ExternalLink size={14} />
          </Button>
        </div>
      </div>
    </>
  );

  const renderNaoEncontrado = () => (
    <>
      {renderHeader(<AlertTriangle size={20} className="text-amber-400" />, "Pedido não encontrado")}
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          {resultado?.message || "Pedido não encontrado no ERP Omie."}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
          <Button onClick={handleTentarNovamente}>
            <ArrowLeft size={14} /> Tentar novamente
          </Button>
        </div>
      </div>
    </>
  );

  const renderErro = () => (
    <>
      {renderHeader(<XCircle size={20} className="text-destructive" />, "Erro na importação")}
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          {resultado?.message || "Erro desconhecido"}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={() => setEstado("IDLE")}>
            <ArrowLeft size={14} /> Tentar novamente
          </Button>
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        {estado === "IDLE" && renderIdle()}
        {estado === "BUSCANDO" && renderBuscando()}
        {estado === "SUCESSO" && renderSucesso()}
        {estado === "JA_IMPORTADA" && renderJaImportada()}
        {estado === "NAO_ENCONTRADO" && renderNaoEncontrado()}
        {estado === "ERRO" && renderErro()}
      </DialogContent>
    </Dialog>
  );
}
