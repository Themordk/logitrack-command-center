import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

interface Props {
  open: boolean;
  usuarioId: string;
  onSuccess: () => void;
  /** Visual variant: 'admin' for light panel, 'coletor' for dark mobile */
  variant?: "admin" | "coletor";
}

export function ForcePasswordChangeModal({ open, usuarioId, onSuccess, variant = "admin" }: Props) {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;

      // Clear the flag
      await (supabase as any)
        .from("usuario")
        .update({ deve_trocar_senha: false })
        .eq("id", usuarioId);

      toast.success("Senha alterada com sucesso!");
      onSuccess();
    } catch (err: any) {
      toast.error((() => { const p = parseError(err, "force-password-change-modal"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao alterar senha." : p.title; })());
    } finally {
      setLoading(false);
    }
  };

  const isColetor = variant === "coletor";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full max-w-sm rounded-2xl p-6 space-y-5 ${isColetor ? "bg-[hsl(222,40%,12%)]" : "bg-card border border-border"}`}>
        <div className="flex flex-col items-center gap-2">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isColetor ? "bg-[hsl(217,91%,50%)]" : "bg-primary"}`}>
            <Lock size={24} className={isColetor ? "text-white" : "text-primary-foreground"} />
          </div>
          <h2 className={`text-lg font-bold ${isColetor ? "text-white" : "text-foreground"}`}>
            Troca de Senha Obrigatória
          </h2>
          <p className={`text-sm text-center ${isColetor ? "text-[hsl(213,31%,55%)]" : "text-muted-foreground"}`}>
            Sua senha foi resetada pelo administrador. Defina uma nova senha para continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={`block text-xs font-semibold mb-1.5 uppercase ${isColetor ? "text-[hsl(213,31%,65%)]" : "text-muted-foreground"}`}>
              Nova Senha
            </label>
            <div className="relative">
              <input
                type={showNova ? "text" : "password"}
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className={`w-full h-12 px-4 pr-10 rounded-xl border text-base outline-none transition-colors ${
                  isColetor
                    ? "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,8%)] text-white focus:border-[hsl(217,91%,50%)]"
                    : "border-border bg-secondary/40 text-foreground focus:border-primary"
                }`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowNova(!showNova)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isColetor ? "text-[hsl(213,31%,55%)]" : "text-muted-foreground"}`}
              >
                {showNova ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 uppercase ${isColetor ? "text-[hsl(213,31%,65%)]" : "text-muted-foreground"}`}>
              Confirmar Nova Senha
            </label>
            <div className="relative">
              <input
                type={showConfirmar ? "text" : "password"}
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                placeholder="Repita a nova senha"
                className={`w-full h-12 px-4 pr-10 rounded-xl border text-base outline-none transition-colors ${
                  isColetor
                    ? "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,8%)] text-white focus:border-[hsl(217,91%,50%)]"
                    : "border-border bg-secondary/40 text-foreground focus:border-primary"
                }`}
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirmar(!showConfirmar)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${isColetor ? "text-[hsl(213,31%,55%)]" : "text-muted-foreground"}`}
              >
                {showConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || novaSenha.length < 6 || novaSenha !== confirmar}
            className={`w-full flex items-center justify-center gap-2 h-12 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${
              isColetor
                ? "bg-[hsl(217,91%,50%)] text-white hover:bg-[hsl(217,91%,45%)]"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Alterar Senha
          </button>
        </form>
      </div>
    </div>
  );
}
