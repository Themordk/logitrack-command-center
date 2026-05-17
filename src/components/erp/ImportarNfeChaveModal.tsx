import { useEffect, useState } from "react";
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

type Estado = "IDLE" | "BUSCANDO" | "SUCESSO" | "JA_IMPORTADA" | "ERRO";

interface Resultado {
  status?: string;
  documento_id?: string;
  numero_nota?: string;
  itens_importados?: number;
  itens_nao_resolvidos?: number;
  message?: string;
}

export function ImportarNfeChaveModal({ isOpen, onClose, onSuccess }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [estado, setEstado] = useState<Estado>("IDLE");
  const [chave, setChave] = useState("");
  const [erroValidacao, setErroValidacao] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setEstado("IDLE");
        setChave("");
        setErroValidacao("");
        setResultado(null);
      }, 200);
    }
  }, [isOpen]);

  const handleChange = (v: string) => {
    setChave(v.replace(/\D/g, "").slice(0, 44));
    if (erroValidacao) setErroValidacao("");
  };

  const handleBuscar = async () => {
    if (chave.length < 44) {
      setErroValidacao("A chave de acesso deve ter 44 dígitos.");
      return;
    }
    if (!tenantId || !empresaId) {
      setResultado({ message: "Tenant/Empresa não definidos." });
      setEstado("ERRO");
      return;
    }
    setEstado("BUSCANDO");
    try {
      const { data, error } = await supabase.functions.invoke("sync-recebimentos", {
        body: { tenant_id: tenantId, empresa_id: empresaId, chave_nfe: chave },
      });
      if (error) {
        setResultado({ message: error.message || "Erro ao consultar NF-e" });
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
      window.location.hash = `#/atividades/entradas?documento_id=${id}`;
    }
    onClose();
  };

  const handleImportarOutra = () => {
    setChave("");
    setResultado(null);
    setErroValidacao("");
    setEstado("IDLE");
  };

  const handleTentarNovamente = () => {
    setResultado(null);
    setEstado("IDLE");
  };

  const renderHeader = (icon: React.ReactNode, titulo: string) => (
    <div className="flex items-center gap-2 mb-4">
      <div className="text-primary">{icon}</div>
      <h2 className="text-lg font-semibold text-foreground">{titulo}</h2>
    </div>
  );

  const renderIdle = () => (
    <>
      {renderHeader(<ArrowDownToLine size={20} />, "Importar NF-e por Chave de Acesso")}
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 rounded-lg bg-secondary/40 border border-border">
          <div className="text-primary"><ArrowDownToLine size={28} /></div>
          <p className="text-sm text-muted-foreground">
            Informe a chave de acesso (44 dígitos) da NF-e para importar do ERP Omie.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Chave de acesso da NF-e</Label>
            <span className="text-xs text-muted-foreground tabular-nums">{chave.length}/44</span>
          </div>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="44 dígitos — ex: 23260506199813..."
            value={chave}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBuscar();
              }
            }}
            autoFocus
            className="font-mono"
          />
          {erroValidacao && (
            <p className="text-xs text-destructive">{erroValidacao}</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleBuscar} disabled={chave.length !== 44}>
            <Search size={14} /> Buscar e Importar
          </Button>
        </div>
      </div>
    </>
  );

  const renderBuscando = () => (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <Loader2 size={32} className="animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Consultando NF-e no ERP Omie...</p>
    </div>
  );

  const renderSucesso = () => (
    <>
      {renderHeader(<CheckCircle2 size={20} className="text-emerald-500" />, "Importação concluída")}
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-secondary/40 p-4 space-y-2">
          <p className="text-sm text-foreground">
            NF-e nº <span className="font-semibold">{resultado?.numero_nota}</span> importada com sucesso!
          </p>
          <p className="text-sm text-muted-foreground">
            {resultado?.itens_importados ?? 0} item(ns) importado(s)
          </p>
        </div>
        {(resultado?.itens_nao_resolvidos ?? 0) > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              {resultado?.itens_nao_resolvidos} item(ns) não resolvido(s) — produto sem vínculo no ERP Omie.
            </span>
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={handleImportarOutra}>
            Importar outra NF-e
          </Button>
          <Button onClick={handleVerDocumento} disabled={!resultado?.documento_id}>
            Ver documento de entrada <ExternalLink size={14} />
          </Button>
        </div>
      </div>
    </>
  );

  const renderJaImportada = () => (
    <>
      {renderHeader(<Info size={20} className="text-blue-400" />, "NF-e já importada")}
      <div className="space-y-4">
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-foreground">
          {resultado?.message || "Esta NF-e já foi importada anteriormente."}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2">
          <Button variant="outline" onClick={handleImportarOutra}>
            <ArrowLeft size={14} /> Importar outra
          </Button>
          <Button onClick={handleVerDocumento} disabled={!resultado?.documento_id}>
            Ver documento <ExternalLink size={14} />
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
          <Button variant="outline" onClick={handleTentarNovamente}>
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
        {estado === "ERRO" && renderErro()}
      </DialogContent>
    </Dialog>
  );
}
