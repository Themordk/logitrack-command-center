import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, RefreshCw, ListChecks } from "lucide-react";
import { StatusBar } from "./StatusBar";
import { CredenciaisDinamicasTab } from "./CredenciaisDinamicasTab";
import { SincronizacaoTab } from "./SincronizacaoTab";
import { LogsFilasTab } from "./LogsFilasTab";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  erpProvedorId: string;
  onNavigate: (path: string) => void;
}

export function IntegracaoErpDetalhePage({ erpProvedorId, onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [refreshKey, setRefreshKey] = useState(0);
  const [nome, setNome] = useState<string>(erpProvedorId);
  const [disponivel, setDisponivel] = useState<boolean>(true);
  const bump = () => setRefreshKey((n) => n + 1);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await (supabase as any).rpc("integracao_listar_provedores");
      if (!alive) return;
      const row = (data || []).find((r: any) => r.id === erpProvedorId);
      if (!row) return;
      setNome(row.nome || erpProvedorId);
      setDisponivel(row.disponivel !== false);
    })();
    return () => { alive = false; };
  }, [erpProvedorId]);

  if (!tenantId || !empresaId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-foreground">Integração ERP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Selecione uma empresa para configurar a integração.</p>
        </div>
      </div>
    );
  }

  const k = `${empresaId}::${empresaVersion}::${erpProvedorId}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div>
          <button
            onClick={() => onNavigate("/config/integracao")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
          >
            <ArrowLeft size={12} /> Voltar para provedores
          </button>
          <h1 className="text-xl font-bold text-foreground">Integração ERP — {nome}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Painel de gerenciamento da integração via API REST.
          </p>
        </div>
      </div>

      <StatusBar key={`sb-${k}`} tenantId={tenantId} empresaId={empresaId} refreshKey={refreshKey} nomeProvedor={nome} />

      {!disponivel ? (
        <div className="card-surface p-6 text-sm text-muted-foreground">
          Este provedor ainda não está disponível para configuração.
        </div>
      ) : (
        <Tabs defaultValue="cred" className="w-full flex-1 flex flex-col min-h-0">
          <TabsList className="bg-secondary border border-border self-start">
            <TabsTrigger value="cred" className="flex items-center gap-2">
              <KeyRound size={14} /> Credenciais
            </TabsTrigger>
            <TabsTrigger value="sync" className="flex items-center gap-2">
              <RefreshCw size={14} /> Sincronização
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <ListChecks size={14} /> Logs e Filas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cred" className="flex-1 min-h-0">
            <CredenciaisDinamicasTab
              key={`c-${k}`}
              erpId={erpProvedorId}
              tenantId={tenantId}
              empresaId={empresaId}
              onSaved={bump}
            />
          </TabsContent>
          <TabsContent value="sync" className="flex-1 min-h-0">
            <SincronizacaoTab key={`s-${k}`} tenantId={tenantId} empresaId={empresaId} onChanged={bump} />
          </TabsContent>
          <TabsContent value="logs" className="flex-1 min-h-0 overflow-auto">
            <LogsFilasTab
              key={`l-${k}`}
              tenantId={tenantId}
              empresaId={empresaId}
              sistemaOrigem={erpProvedorId}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
