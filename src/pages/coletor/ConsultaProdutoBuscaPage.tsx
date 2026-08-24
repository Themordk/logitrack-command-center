import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";
import { useDebounce } from "@/hooks/useDebounce";
import { Loader2, Search, AlertCircle, X } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ProdutoRow {
  id: string;
  sku: string;
  descricao: string;
  referencia: string | null;
  url_imagem: string | null;
}

export function ConsultaProdutoBuscaPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";

  const [term, setTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProdutoRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebounce(term, 300);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = debounced.trim();
    if (t.length < 3) {
      setRows([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError("");
      const pattern = `%${t}%`;
      try {
        const [produtoResult, eanResult] = await Promise.all([
          (supabase as any)
            .from("produto")
            .select("id, sku, descricao, referencia, url_imagem")
            .eq("tenant_id", tenantId)
            .eq("empresa_id", empresaId)
            .eq("ativo", true)
            .or(`sku.ilike.${pattern},descricao.ilike.${pattern},referencia.ilike.${pattern}`)
            .order("descricao")
            .limit(30),
          (supabase as any)
            .from("produto_embalagem")
            .select("produto_id, ean, produto:produto_id(id, sku, descricao, referencia, url_imagem, tenant_id, empresa_id, ativo)")
            .ilike("ean", pattern)
            .limit(10),
        ]);

        if (cancelled) return;

        const map = new Map<string, ProdutoRow>();
        (produtoResult?.data || []).forEach((p: any) => {
          map.set(p.id, {
            id: p.id,
            sku: p.sku,
            descricao: p.descricao,
            referencia: p.referencia ?? null,
            url_imagem: p.url_imagem ?? null,
          });
        });
        (eanResult?.data || []).forEach((e: any) => {
          const p = e.produto;
          if (!p || !p.id) return;
          if (p.tenant_id !== tenantId || p.empresa_id !== empresaId || p.ativo !== true) return;
          if (map.has(p.id)) return;
          map.set(p.id, {
            id: p.id,
            sku: p.sku,
            descricao: p.descricao,
            referencia: p.referencia ?? null,
            url_imagem: p.url_imagem ?? null,
          });
        });

        setRows(Array.from(map.values()));
        setSearched(true);
      } catch {
        if (!cancelled) {
          setRows([]);
          setSearched(true);
          setError("Erro ao buscar produtos.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [debounced, tenantId, empresaId]);

  const handleSelect = async (produtoId: string) => {
    setError("");
    try {
      const { data: emb } = await (supabase as any)
        .from("produto_embalagem")
        .select("ean")
        .eq("produto_id", produtoId)
        .order("fator", { ascending: true })
        .limit(1);

      const ean = emb && emb.length > 0 ? emb[0].ean : null;
      if (!ean) {
        setError("Produto sem embalagem/EAN cadastrado.");
        return;
      }
      sessionStorage.setItem("coletor_busca_ean", ean);
      onNavigate("/coletor/consulta/produto");
    } catch {
      setError("Erro ao carregar embalagem do produto.");
    }
  };

  const tooShort = term.trim().length > 0 && term.trim().length < 3;

  return (
    <ColetorLayout title="Buscar Produto" onNavigate={onNavigate} showBack backPath="/coletor/consulta/produto">
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[hsl(213,31%,55%)]" />
        <input
          ref={inputRef}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar por descrição, SKU ou referência..."
          className="w-full bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] text-white rounded-xl h-12 pl-9 pr-10 text-sm outline-none focus:border-[hsl(217,91%,50%)]"
        />
        {term && (
          <button
            onClick={() => { setTerm(""); inputRef.current?.focus(); }}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-[hsl(213,31%,55%)] active:bg-[hsl(222,35%,20%)]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{error}</div>
      )}

      {tooShort && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-6">
          Digite pelo menos 3 caracteres para buscar
        </div>
      )}

      {!term && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-10 px-6">
          Use o campo acima para buscar produtos por descrição, SKU ou referência
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>
      )}

      {!loading && searched && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-10 text-[hsl(213,31%,55%)]">
          <AlertCircle size={28} />
          <p className="text-sm text-center">Nenhum produto encontrado para "{term.trim()}"</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex flex-col gap-2">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p.id)}
              className="w-full text-left bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 flex items-center gap-3 active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all"
            >
              <ProdutoImagemThumb
                url={p.url_imagem}
                alt={p.descricao}
                caption={`${p.sku} - ${p.descricao}`}
                size={48}
                variant="coletor"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">{p.descricao}</p>
                <p className="text-xs text-[hsl(213,31%,55%)] font-mono">SKU: {p.sku}</p>
                {p.referencia && <p className="text-xs text-[hsl(213,31%,55%)]">Ref: {p.referencia}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </ColetorLayout>
  );
}
