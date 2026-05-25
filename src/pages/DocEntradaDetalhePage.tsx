import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Package, Hash, Clock, MapPin, AlertTriangle, User, Truck } from "lucide-react";
import { formatDateTime, formatDate } from "@/utils/dateTime";

interface Props {
  documentoId: string;
  onBack: () => void;
}

interface Header {
  id: string;
  numero_nota: string;
  data_emissao: string;
  data_entrada: string;
  status: number;
  qtd_volume: number | null;
  valor_total_produtos: number;
  valor_total_nota: number;
  created_at: string | null;
  parceiro_id: string;
  tipo_entrada_id: string;
  chave_nfe: string | null;
}

interface ItemRow {
  id: string;
  produto_id: string;
  quantidade: number;
  valor_unidade: number;
  valor_total: number;
  produto_sku?: string;
  produto_descricao?: string;
  lotes?: { id: string; lote: string; validade: string; fabricacao: string; serie: string | null; quantidade: number }[];
}

const STATUS_MAP: Record<number, { label: string; cls: string }> = {
  0: { label: "Pendente", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  1: { label: "Em Movimento", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  2: { label: "Concluído", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function InfoItem({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 whitespace-nowrap">
        {icon}{label}
      </span>
      <span className="text-sm font-medium text-foreground break-words">{value || "—"}</span>
    </div>
  );
}

function fmtMoney(v: number | null | undefined): string {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function DocEntradaDetalhePage({ documentoId, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [header, setHeader] = useState<Header | null>(null);
  const [parceiro, setParceiro] = useState<{ razaosocial: string; cnpj: string } | null>(null);
  const [tipoEntrada, setTipoEntrada] = useState<string>("");
  const [armazem, setArmazem] = useState<string>("");
  const [items, setItems] = useState<ItemRow[]>([]);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const { data: doc, error: docErr } = await (supabase as any)
          .from("documento_entrada")
          .select("id, numero_nota, data_emissao, data_entrada, status, qtd_volume, valor_total_produtos, valor_total_nota, created_at, parceiro_id, tipo_entrada_id, armazem_id, chave_nfe")
          .eq("id", documentoId)
          .single();
        if (docErr) throw docErr;
        setHeader(doc as Header);

        const [parceiroRes, tipoRes, armRes, itemsRes] = await Promise.all([
          (supabase as any).from("parceiro").select("razaosocial, cnpj").eq("id", doc.parceiro_id).single(),
          doc.tipo_entrada_id
            ? (supabase as any).from("tipo_entrada").select("descricao").eq("id", doc.tipo_entrada_id).single()
            : Promise.resolve({ data: null }),
          doc.armazem_id
            ? (supabase as any).from("armazem").select("descricao").eq("id", doc.armazem_id).single()
            : Promise.resolve({ data: null }),
          (supabase as any)
            .from("documento_entrada_item")
            .select("id, produto_id, quantidade, valor_unidade, valor_total")
            .eq("documento_entrada_id", documentoId),
        ]);

        setParceiro(parceiroRes.data || null);
        setTipoEntrada(tipoRes.data?.descricao || "");
        setArmazem(armRes.data?.descricao || "");

        const rawItems = (itemsRes.data || []) as ItemRow[];
        if (rawItems.length === 0) {
          setItems([]);
          return;
        }

        const produtoIds = Array.from(new Set(rawItems.map((i) => i.produto_id)));
        const itemIds = rawItems.map((i) => i.id);

        const [prodRes, lotesRes] = await Promise.all([
          (supabase as any).from("produto").select("id, sku, descricao").in("id", produtoIds),
          (supabase as any)
            .from("documento_entrada_item_lote")
            .select("id, documento_entrada_item_id, lote, validade, fabricacao, serie, quantidade")
            .in("documento_entrada_item_id", itemIds),
        ]);

        const produtoMap = new Map<string, { sku: string; descricao: string }>();
        (prodRes.data || []).forEach((p: any) => produtoMap.set(p.id, { sku: p.sku, descricao: p.descricao }));

        const lotesMap = new Map<string, ItemRow["lotes"]>();
        (lotesRes.data || []).forEach((l: any) => {
          const arr = lotesMap.get(l.documento_entrada_item_id) || [];
          arr.push({ id: l.id, lote: l.lote, validade: l.validade, fabricacao: l.fabricacao, serie: l.serie, quantidade: Number(l.quantidade) });
          lotesMap.set(l.documento_entrada_item_id, arr);
        });

        const enriched = rawItems.map((it) => ({
          ...it,
          produto_sku: produtoMap.get(it.produto_id)?.sku || "—",
          produto_descricao: produtoMap.get(it.produto_id)?.descricao || "—",
          lotes: lotesMap.get(it.id) || [],
        }));
        setItems(enriched);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Erro ao carregar documento.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [documentoId]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-fade-in">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-56" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !header) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 animate-fade-in">
        <AlertTriangle className="text-destructive" size={40} />
        <p className="text-muted-foreground">{error || "Documento não encontrado."}</p>
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </Button>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[header.status] || { label: String(header.status), cls: "bg-secondary text-secondary-foreground" };
  const totalSkus = items.length;
  const totalQtde = items.reduce((s, it) => s + Number(it.quantidade || 0), 0);

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft size={14} /> Voltar
        </Button>
        <div>
          <h2 className="text-base font-semibold text-foreground">Detalhe do Documento de Entrada</h2>
          <p className="text-xs text-muted-foreground">
            Nº Nota: <span className="font-mono">{header.numero_nota}</span> · {parceiro?.razaosocial || "—"}
          </p>
        </div>
      </div>

      {/* Card 1: Dados do Documento */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText size={16} className="text-primary" />
            Dados do Documento
            <Badge className={`ml-2 text-[10px] ${statusInfo.cls}`}>{statusInfo.label}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Nº Nota" value={header.numero_nota} icon={<Hash size={10} />} />
          <InfoItem label="Data Emissão" value={formatDate(header.data_emissao)} icon={<Clock size={10} />} />
          <InfoItem label="Data Entrada" value={formatDate(header.data_entrada)} icon={<Clock size={10} />} />
          <InfoItem label="Tipo Entrada" value={tipoEntrada} />
          <InfoItem label="Parceiro" value={parceiro?.razaosocial} icon={<User size={10} />} />
          <InfoItem label="CNPJ" value={parceiro?.cnpj} />
          <InfoItem label="Armazém" value={armazem} icon={<MapPin size={10} />} />
          <InfoItem label="Qtd Volumes" value={header.qtd_volume ?? "—"} icon={<Truck size={10} />} />
          <InfoItem label="Chave de Acesso" value={header.chave_nfe} icon={<Hash size={10} />} />
          <InfoItem label="Valor Produtos" value={fmtMoney(header.valor_total_produtos)} />
          <InfoItem label="Valor Total Nota" value={fmtMoney(header.valor_total_nota)} />
          <InfoItem label="Criado em" value={formatDateTime(header.created_at)} icon={<Clock size={10} />} />
        </CardContent>
      </Card>

      {/* Card 2: Itens */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package size={16} className="text-primary" />
            Itens do Documento ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Nenhum item encontrado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Produto</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Quantidade</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Valor Unit.</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Valor Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <Fragment key={it.id}>
                    <tr className="border-b border-border/50">
                      <td className="px-4 py-2.5 font-mono text-xs text-foreground">{it.produto_sku}</td>
                      <td className="px-4 py-2.5 text-foreground">{it.produto_descricao}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{Number(it.quantidade).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{fmtMoney(it.valor_unidade)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-foreground">{fmtMoney(it.valor_total)}</td>
                    </tr>
                    {it.lotes && it.lotes.length > 0 && (
                      <tr key={`${it.id}-lotes`} className="border-b border-border/50 bg-secondary/10">
                        <td colSpan={5} className="px-8 py-2">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lotes</div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] uppercase text-muted-foreground">
                                <th className="text-left py-1 pr-4">Lote</th>
                                <th className="text-left py-1 pr-4">Validade</th>
                                <th className="text-left py-1 pr-4">Fabricação</th>
                                <th className="text-left py-1 pr-4">Série</th>
                                <th className="text-right py-1">Quantidade</th>
                              </tr>
                            </thead>
                            <tbody>
                              {it.lotes.map((l) => (
                                <tr key={l.id} className="text-foreground">
                                  <td className="py-0.5 pr-4 font-mono">{l.lote || "—"}</td>
                                  <td className="py-0.5 pr-4">{formatDate(l.validade)}</td>
                                  <td className="py-0.5 pr-4">{formatDate(l.fabricacao)}</td>
                                  <td className="py-0.5 pr-4 font-mono">{l.serie || "—"}</td>
                                  <td className="py-0.5 text-right font-mono">{Number(l.quantidade).toLocaleString("pt-BR")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/30 font-medium">
                  <td colSpan={2} className="px-4 py-2.5 text-xs text-muted-foreground uppercase">
                    Total: {totalSkus} SKU(s)
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">{totalQtde.toLocaleString("pt-BR")}</td>
                  <td></td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">{fmtMoney(header.valor_total_produtos)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
