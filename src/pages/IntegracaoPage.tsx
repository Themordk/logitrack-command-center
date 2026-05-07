import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KeyRound, RefreshCw, ListChecks } from "lucide-react";
import { StatusBar } from "./integracao/StatusBar";
import { CredenciaisTab } from "./integracao/CredenciaisTab";
import { SincronizacaoTab } from "./integracao/SincronizacaoTab";
import { LogsFilasTab } from "./integracao/LogsFilasTab";

export function IntegracaoPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((n) => n + 1);

  if (!tenantId || !empresaId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-foreground">Integração ERP — Omie</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Selecione uma empresa para configurar a integração.</p>
        </div>
      </div>
    );
  }

  // Use empresaVersion to force remount on switch
  const k = `${empresaId}::${empresaVersion}`;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Integração ERP — Omie</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Painel de gerenciamento do middleware de integração via API REST.</p>
      </div>

      <StatusBar key={`sb-${k}`} tenantId={tenantId} empresaId={empresaId} refreshKey={refreshKey} />

      <Tabs defaultValue="sync" className="w-full flex-1 flex flex-col min-h-0">
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
          <CredenciaisTab key={`c-${k}`} tenantId={tenantId} empresaId={empresaId} onSaved={bump} />
        </TabsContent>
        <TabsContent value="sync" className="flex-1 min-h-0">
          <SincronizacaoTab key={`s-${k}`} tenantId={tenantId} empresaId={empresaId} onChanged={bump} />
        </TabsContent>
        <TabsContent value="logs" className="flex-1 min-h-0 overflow-auto">
          <LogsFilasTab key={`l-${k}`} tenantId={tenantId} empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
