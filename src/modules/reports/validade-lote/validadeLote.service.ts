import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

export interface ValidadeLoteFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  setor_id?: string;
  tipo_endereco?: string;
  sku?: string;
  marca?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  criticidade?: "VENCIDO" | "CRITICO" | "ATENCAO" | "OK";
  validade_ate?: string;
  ordem?: "FEFO" | "FIFO";
}

export interface ValidadeLoteRow {
  id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  subgrupo_id: string | null;
  lote: string;
  data_fabricacao: string;
  data_validade: string;
  dias_para_vencer: number;
  saldo: number;
  endereco_id: string | null;
  codigo_endereco: string;
  tipo_endereco: string;
  armazem_id: string | null;
  setor_id: string | null;
  criticidade: "VENCIDO" | "CRITICO" | "ATENCAO" | "OK";
}

function classifica(dias: number): ValidadeLoteRow["criticidade"] {
  if (dias < 0) return "VENCIDO";
  if (dias <= 30) return "CRITICO";
  if (dias <= 60) return "ATENCAO";
  return "OK";
}

export async function fetchValidadeLoteReport(filters: ValidadeLoteFilter): Promise<ValidadeLoteRow[]> {
  const data = await fetchAllSelectRows<any>(
    "estoque_geral",
    `
      id,
      lote,
      data_validade,
      data_fabricacao,
      quantidade_total,
      produto_id,
      endereco_id,
      produto:produto_id ( sku, descricao, marca, grupo_id, subgrupo_id, tipo_controle ),
      endereco:endereco_id ( descricao, tipo_endereco, armazem_id, setor_id )
    `,
    (q) => {
      q = q.eq("tenant_id", filters.tenant_id).gt("quantidade_total", 0);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      return q;
    },
  );

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let rows: ValidadeLoteRow[] = data
    .filter((row: any) => {
      // Apenas produtos com controle de lote/validade
      const tc = row.produto?.tipo_controle;
      if (!tc || !["LOTE", "VALIDADE", "LOTE_SERIE"].includes(tc)) return false;
      // Omitir registros sem controle real (lote vazio + validade default)
      if ((!row.lote || row.lote === "") && row.data_validade === "1900-01-01") return false;
      return true;
    })
    .map((row: any) => {
      const validade = new Date(row.data_validade);
      validade.setHours(0, 0, 0, 0);
      const dias = Math.floor((validade.getTime() - hoje.getTime()) / 86400000);
      return {
        id: row.id,
        produto_id: row.produto_id,
        sku: row.produto?.sku || "—",
        descricao: row.produto?.descricao || "—",
        marca: row.produto?.marca || "",
        grupo_id: row.produto?.grupo_id ?? null,
        subgrupo_id: row.produto?.subgrupo_id ?? null,
        lote: row.lote || "",
        data_fabricacao: row.data_fabricacao,
        data_validade: row.data_validade,
        dias_para_vencer: dias,
        saldo: Number(row.quantidade_total),
        endereco_id: row.endereco_id,
        codigo_endereco: row.endereco?.descricao || "",
        tipo_endereco: row.endereco?.tipo_endereco || "",
        armazem_id: row.endereco?.armazem_id || null,
        setor_id: row.endereco?.setor_id || null,
        criticidade: classifica(dias),
      } as ValidadeLoteRow;
    });

  // Filtros client-side
  if (filters.armazem_id) rows = rows.filter((r) => r.armazem_id === filters.armazem_id);
  if (filters.setor_id) rows = rows.filter((r) => r.setor_id === filters.setor_id);
  if (filters.tipo_endereco) rows = rows.filter((r) => r.tipo_endereco === filters.tipo_endereco);
  if (filters.sku) {
    const s = filters.sku.toLowerCase();
    rows = rows.filter((r) => r.sku.toLowerCase().includes(s));
  }
  if (filters.marca) {
    const s = filters.marca.toLowerCase();
    rows = rows.filter((r) => r.marca.toLowerCase().includes(s));
  }
  if (filters.grupo_id) rows = rows.filter((r) => r.grupo_id === filters.grupo_id);
  if (filters.subgrupo_id) rows = rows.filter((r) => r.subgrupo_id === filters.subgrupo_id);
  if (filters.criticidade) rows = rows.filter((r) => r.criticidade === filters.criticidade);
  if (filters.validade_ate) rows = rows.filter((r) => r.data_validade <= filters.validade_ate!);

  // Ordenação
  if (filters.ordem === "FIFO") {
    rows.sort((a, b) => (a.data_fabricacao || "").localeCompare(b.data_fabricacao || "") || a.sku.localeCompare(b.sku));
  } else {
    rows.sort((a, b) => (a.data_validade || "").localeCompare(b.data_validade || "") || a.sku.localeCompare(b.sku));
  }

  return rows;
}
