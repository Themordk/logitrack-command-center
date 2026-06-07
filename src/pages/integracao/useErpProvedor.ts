import { useEffect, useState } from "react";
import { mw } from "./entidades";

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
      const { data: row, error } = await mw
        .from("erp_provedor")
        .select("id,nome,disponivel,esquema_credencial")
        .eq("id", erpId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setError(error.message);
        setData(null);
      } else if (row) {
        setData({
          id: row.id,
          nome: row.nome,
          disponivel: row.disponivel !== false,
          esquema_credencial: Array.isArray(row.esquema_credencial) ? row.esquema_credencial : [],
        });
      } else {
        setData(null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [erpId]);

  return { data, loading, error };
}
