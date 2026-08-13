import { useState, useEffect } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useOffline } from "@/contexts/OfflineContext";


interface Props { onNavigate: (path: string) => void; }

const HISTORICO_KEY = "coletor_inventario_livre_historico";

export function InventarioLivreEnderecoPage({ onNavigate }: Props) {
  const [lastScanned, setLastScanned] = useState("");
  const [loading, setLoading] = useState(false);
  const result = useResultDialog({ coletorMode: true });
  const [contados, setContados] = useState(0);
  const { isOnline, cacheData, getCachedData } = useOffline();

  const numero = sessionStorage.getItem("coletor_inventario_numero") || "";

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HISTORICO_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      setContados(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setContados(0);
    }
  }, []);

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setLoading(true);
    const cacheKey = `inventario_livre_endereco_${code}`;
    try {
      let found: any = null;

      if (!isOnline) {
        found = await getCachedData<any>(cacheKey);
      } else {
        const { data: enderecos, error } = await (supabase as any)
          .from("endereco")
          .select("id, descricao, codigo_endereco, armazem_id")
          .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
          .limit(1);
        if (error) throw error;
        found = enderecos?.[0] || null;
        if (found) await cacheData(cacheKey, found, 240).catch(() => {});
      }

      if (!found) {
        result.showWarning(
          isOnline ? "Endereço não encontrado." : "Endereço não encontrado em cache. Conecte-se para validar.",
          { onClose: () => setLastScanned("") },
        );
        setLoading(false);
        return;
      }

      sessionStorage.setItem("coletor_inventario_livre_endereco_id", String(found.id));
      sessionStorage.setItem("coletor_inventario_livre_endereco_codigo", String(found.codigo_endereco ?? ""));
      sessionStorage.setItem("coletor_inventario_livre_endereco_descricao", String(found.descricao ?? ""));

      // Track distinct addresses visited in session
      try {
        const raw = sessionStorage.getItem(HISTORICO_KEY);
        const arr: string[] = raw ? JSON.parse(raw) : [];
        if (!arr.includes(String(found.id))) {
          arr.push(String(found.id));
          sessionStorage.setItem(HISTORICO_KEY, JSON.stringify(arr));
        }
      } catch { /* ignore */ }

      toast.success("Endereço confirmado!");
      onNavigate("/coletor/inventario/livre/produto");
    } catch (err: unknown) {
      result.showError(err, { context: "inventario-livre-endereco", onClose: () => setLastScanned("") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout
      title={`Inventário #${numero} — Contagem Livre`}
      onNavigate={onNavigate}
      showBack
      backPath="/coletor/inventario"
    >
      <div className="flex flex-col gap-3 flex-1">
        {/* Badge */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
            Contagem Livre
          </span>
          {loading && <span className="text-xs text-[hsl(213,31%,55%)]">Validando...</span>}
        </div>

        {/* Info card */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Escanear Endereço</span>
          </div>
          <p className="text-xs text-[hsl(213,31%,55%)]">
            Escaneie qualquer endereço do armazém
          </p>
        </div>

        {/* Scan */}
        <ScanField
          label="Escanear Endereço"
          lastScanned={lastScanned}
          onScan={handleScan}
          placeholder="Escaneie o código de barras do endereço"
        />

        {/* Session summary */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-3">
          <p className="text-xs text-[hsl(213,31%,55%)]">
            Endereços contados nesta sessão:{" "}
            <span className="font-bold text-[hsl(213,31%,91%)]">{contados}</span>
          </p>
        </div>

        {/* End session */}
        <ActionButton onClick={() => onNavigate("/coletor/inventario")} variant="secondary">
          Encerrar Sessão
        </ActionButton>
      </div>

      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}

