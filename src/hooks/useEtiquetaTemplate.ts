import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CampoEtiqueta {
  chave: string;
  label: string;
  ativo: boolean;
  ordem: number;
}

export type TipoEtiquetaConfig = "ENDERECO" | "HU" | "PRODUTO" | "VOLUME";

export interface EtiquetaConfig {
  id: string;
  tenant_id: string;
  empresa_id: string | null;
  tipo: TipoEtiquetaConfig;
  nome: string;
  tamanho: string;
  orientacao: "horizontal" | "vertical";
  com_cabecalho: boolean;
  com_logo: boolean;
  logo_url: string | null;
  campos: CampoEtiqueta[];
  versao: number;
  ativo: boolean;
}

export function useEtiquetaTemplate(tipo: string, empresaId?: string | null) {
  const [config, setConfig] = useState<EtiquetaConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadFlag, setReloadFlag] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)(
          "resolver_etiqueta_template",
          { p_tipo: tipo, p_empresa_id: empresaId || null }
        );
        if (!cancelled && !error && data && data.length > 0) {
          const row = data[0];
          setConfig({
            ...row,
            campos: typeof row.campos === "string" ? JSON.parse(row.campos) : row.campos,
          });
        } else if (!cancelled) {
          setConfig(null);
        }
      } catch (err) {
        console.error("[useEtiquetaTemplate]", err);
        if (!cancelled) setConfig(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [tipo, empresaId, reloadFlag]);

  const reload = () => setReloadFlag((v) => v + 1);

  return { config, loading, reload };
}
