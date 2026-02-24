import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Save, Loader2, Database, Settings2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const TIPO_BANCO_OPTIONS = ["SQL Server", "Oracle", "MySQL", "Postgres", "Firebird"];

const OBJETOS_SISTEMA = [
  "Parceiro",
  "GrupoProduto",
  "Produto",
  "SubgrupoProduto",
  "Documento_Entrada",
  "Documento_Entrada_Item",
  "Documento_Entrada_Item_LOTE",
  "Movimento_Entrada",
  "Movimento_Entrada_Item",
  "Movimento_Entrada_documento",
];

export function IntegracaoPage() {
  const { tenantId, armazemId } = useTenant();

  // Connection tab
  const [config, setConfig] = useState({
    host: "", banco: "", usuario_bd: "", senha: "", tipo_banco: "SQL Server",
  });
  const [configId, setConfigId] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [showSenha, setShowSenha] = useState(false);

  // Objects tab
  const [objetos, setObjetos] = useState<Record<string, { tabela_erp: string; campo_chave: string; campo_atualizacao: string }>>({});
  const [savingObjetos, setSavingObjetos] = useState(false);
  const [loadingObjetos, setLoadingObjetos] = useState(true);

  useEffect(() => {
    if (!tenantId || !armazemId) return;
    loadConfig();
    loadObjetos();
  }, [tenantId, armazemId]);

  const loadConfig = async () => {
    setLoadingConfig(true);
    const { data } = await (supabase as any).from("integracao_config")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("armazem_id", armazemId)
      .maybeSingle();
    if (data) {
      setConfigId(data.id);
      setConfig({
        host: data.host || "",
        banco: data.banco || "",
        usuario_bd: data.usuario_bd || "",
        senha: "", // Never show saved password
        tipo_banco: data.tipo_banco || "SQL Server",
      });
    }
    setLoadingConfig(false);
  };

  const loadObjetos = async () => {
    setLoadingObjetos(true);
    const { data } = await (supabase as any).from("integracao_objetos")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("armazem_id", armazemId);
    const map: Record<string, any> = {};
    OBJETOS_SISTEMA.forEach((obj) => {
      const found = (data || []).find((d: any) => d.objeto_sistema === obj);
      map[obj] = {
        tabela_erp: found?.tabela_erp || "",
        campo_chave: found?.campo_chave || "",
        campo_atualizacao: found?.campo_atualizacao || "",
      };
    });
    setObjetos(map);
    setLoadingObjetos(false);
  };

  const saveConfig = async () => {
    if (!config.host || !config.banco || !config.usuario_bd || !config.tipo_banco) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSavingConfig(true);
    try {
      const payload: any = {
        tenant_id: tenantId,
        armazem_id: armazemId,
        host: config.host,
        banco: config.banco,
        usuario_bd: config.usuario_bd,
        tipo_banco: config.tipo_banco,
        updated_at: new Date().toISOString(),
      };
      // Only update password if user typed a new one
      if (config.senha) {
        payload.senha_criptografada = btoa(config.senha); // Base64 encoding as basic obfuscation
      }
      if (configId) {
        const { error } = await (supabase as any).from("integracao_config").update(payload).eq("id", configId);
        if (error) throw error;
      } else {
        if (!config.senha) {
          toast.error("Senha é obrigatória para nova configuração");
          setSavingConfig(false);
          return;
        }
        payload.senha_criptografada = btoa(config.senha);
        const { data, error } = await (supabase as any).from("integracao_config").insert(payload).select("id").single();
        if (error) throw error;
        setConfigId(data.id);
      }
      setConfig((prev) => ({ ...prev, senha: "" }));
      toast.success("Configurações salvas com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    }
    setSavingConfig(false);
  };

  const saveObjetos = async () => {
    setSavingObjetos(true);
    try {
      for (const obj of OBJETOS_SISTEMA) {
        const val = objetos[obj];
        const payload = {
          tenant_id: tenantId,
          armazem_id: armazemId,
          objeto_sistema: obj,
          tabela_erp: val.tabela_erp || null,
          campo_chave: val.campo_chave || null,
          campo_atualizacao: val.campo_atualizacao || null,
          updated_at: new Date().toISOString(),
        };
        await (supabase as any).from("integracao_objetos").upsert(payload, {
          onConflict: "tenant_id,armazem_id,objeto_sistema",
        });
      }
      toast.success("Objetos de integração salvos!");
    } catch (err: any) {
      toast.error(`Erro ao salvar: ${err.message}`);
    }
    setSavingObjetos(false);
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  return (
    <div className="space-y-4 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Integração ERP</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configurações de conexão e mapeamento de objetos</p>
      </div>

      <Tabs defaultValue="conexao" className="w-full">
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="conexao" className="flex items-center gap-2">
            <Database size={14} /> Conexão com Banco ERP
          </TabsTrigger>
          <TabsTrigger value="objetos" className="flex items-center gap-2">
            <Settings2 size={14} /> Objetos de Integração
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexao">
          <div className="card-surface p-6 space-y-5">
            {loadingConfig ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Host <span className="text-destructive">*</span></label>
                    <input value={config.host} onChange={(e) => setConfig((p) => ({ ...p, host: e.target.value }))} placeholder="192.168.1.100" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Banco <span className="text-destructive">*</span></label>
                    <input value={config.banco} onChange={(e) => setConfig((p) => ({ ...p, banco: e.target.value }))} placeholder="ERPSISTEMA" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Usuário BD <span className="text-destructive">*</span></label>
                    <input value={config.usuario_bd} onChange={(e) => setConfig((p) => ({ ...p, usuario_bd: e.target.value }))} placeholder="sa" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Senha {!configId && <span className="text-destructive">*</span>}</label>
                    <div className="relative">
                      <input
                        type={showSenha ? "text" : "password"}
                        value={config.senha}
                        onChange={(e) => setConfig((p) => ({ ...p, senha: e.target.value }))}
                        placeholder={configId ? "••• (deixe vazio para manter)" : "Senha do banco"}
                        className={inputClass}
                      />
                      <button type="button" onClick={() => setShowSenha(!showSenha)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                        {showSenha ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Tipo de Banco <span className="text-destructive">*</span></label>
                    <select
                      value={config.tipo_banco}
                      onChange={(e) => setConfig((p) => ({ ...p, tipo_banco: e.target.value }))}
                      className={cn(inputClass, "cursor-pointer")}
                    >
                      {TIPO_BANCO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={saveConfig} disabled={savingConfig} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {savingConfig ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingConfig ? "Salvando..." : "Salvar Configurações"}
                  </button>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="objetos">
          <div className="card-surface p-6 space-y-5">
            {loadingObjetos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Objeto Sistema</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tabela ERP</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campo Chave</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campo Atualização</th>
                      </tr>
                    </thead>
                    <tbody>
                      {OBJETOS_SISTEMA.map((obj, idx) => (
                        <tr key={obj} className={cn("border-b border-border/50", idx % 2 !== 0 && "bg-secondary/10")}>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-sm font-semibold text-primary">{obj}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              value={objetos[obj]?.tabela_erp || ""}
                              onChange={(e) => setObjetos((p) => ({ ...p, [obj]: { ...p[obj], tabela_erp: e.target.value } }))}
                              placeholder="ex: TB_PARCEIRO"
                              className="w-full h-8 px-2 rounded border border-border bg-secondary/40 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              value={objetos[obj]?.campo_chave || ""}
                              onChange={(e) => setObjetos((p) => ({ ...p, [obj]: { ...p[obj], campo_chave: e.target.value } }))}
                              placeholder="ex: ID"
                              className="w-full h-8 px-2 rounded border border-border bg-secondary/40 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </td>
                          <td className="px-4 py-2.5">
                            <input
                              value={objetos[obj]?.campo_atualizacao || ""}
                              onChange={(e) => setObjetos((p) => ({ ...p, [obj]: { ...p[obj], campo_atualizacao: e.target.value } }))}
                              placeholder="ex: DT_ATUALIZACAO"
                              className="w-full h-8 px-2 rounded border border-border bg-secondary/40 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end pt-2">
                  <button onClick={saveObjetos} disabled={savingObjetos} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {savingObjetos ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {savingObjetos ? "Salvando..." : "Salvar Objetos"}
                  </button>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
