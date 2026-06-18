import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EsquemaCampo = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "senha";
  obrigatorio?: boolean;
  placeholder?: string;
  padrao?: string;
};

export interface ErpProvedor {
  id: string;
  nome: string;
  disponivel: boolean;
  esquema_credencial: EsquemaCampo[];
}

export function useErpProvedor(erpId: string) {
  const [data, setData] = useState<ErpProvedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      const { data: rows, error } = await (supabase as any).rpc("integracao_listar_provedores");
      if (!alive) return;
      if (error) {
        setError(error.message);
        setData(null);
      } else {
        const row = (rows || []).find((r: any) => r.id === erpId);
        if (row) {
          const esquema = row.esquema_credencial;
          setData({
            id: row.id,
            nome: row.nome,
            disponivel: row.disponivel !== false,
            esquema_credencial: Array.isArray(esquema)
              ? esquema
              : (esquema && typeof esquema === "object" ? (esquema as any) : []),
          });
        } else {
          setData(null);
        }
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [erpId]);

  return { data, loading, error };
}
