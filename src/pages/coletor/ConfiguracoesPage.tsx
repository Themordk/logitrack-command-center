import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Settings, Smartphone, ScanBarcode, Lock, Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

interface Props { onNavigate: (path: string) => void; }

export function ConfiguracoesPage({ onNavigate }: Props) {
  const [tipoDispositivo, setTipoDispositivo] = useState(
    () => localStorage.getItem("coletor_tipo_dispositivo") || "celular"
  );

  // Password change state
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showAtual, setShowAtual] = useState(false);
  const [showNova, setShowNova] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);

  const handleChange = (tipo: string) => {
    setTipoDispositivo(tipo);
    localStorage.setItem("coletor_tipo_dispositivo", tipo);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (novaSenha.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setChangingPassword(true);
    try {
      // Get current user's login to fetch email
      const login = localStorage.getItem("core_usuario_nome");
      const usuarioId = localStorage.getItem("core_usuario_id");

      // Validate current password by re-authenticating
      const { data: session } = await supabase.auth.getSession();
      const currentEmail = session?.session?.user?.email;

      if (!currentEmail) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentEmail,
        password: senhaAtual,
      });

      if (signInError) {
        toast.error("Senha atual incorreta.");
        return;
      }

      // Update password
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;

      // Clear force-change flag if set
      if (usuarioId) {
        await (supabase as any)
          .from("usuario")
          .update({ deve_trocar_senha: false })
          .eq("id", usuarioId);
      }

      toast.success("Senha alterada com sucesso!");
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");
    } catch (err: any) {
      const parsed = parseError(err, "configuracoes-coletor");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao alterar senha." : parsed.title);
    } finally {
      setChangingPassword(false);
    }
  };

  const inputClass = "w-full h-12 px-4 pr-10 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,8%)] text-base text-white outline-none focus:border-[hsl(217,91%,50%)] transition-colors";
  const labelClass = "block text-xs font-semibold text-[hsl(213,31%,65%)] mb-1.5 uppercase";

  return (
    <ColetorLayout title="Configurações" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-6">
        {/* Device Type */}
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-foreground">Tipo de Dispositivo</h2>
          <p className="text-sm text-muted-foreground">
            Selecione o tipo de dispositivo para otimizar a experiência de uso.
          </p>

          <button
            onClick={() => handleChange("coletor")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              tipoDispositivo === "coletor"
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <ScanBarcode size={28} className={tipoDispositivo === "coletor" ? "text-primary" : "text-muted-foreground"} />
            <div className="text-left">
              <div className="font-semibold text-foreground">Coletor com leitor</div>
              <div className="text-xs text-muted-foreground">Zebra, Honeywell, etc. Teclado virtual desativado nos campos de scan.</div>
            </div>
          </button>

          <button
            onClick={() => handleChange("celular")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
              tipoDispositivo === "celular"
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <Smartphone size={28} className={tipoDispositivo === "celular" ? "text-primary" : "text-muted-foreground"} />
            <div className="text-left">
              <div className="font-semibold text-foreground">Celular / Tablet</div>
              <div className="text-xs text-muted-foreground">Teclado virtual disponível para digitação manual.</div>
            </div>
          </button>
        </div>

        {/* Change Password */}
        <div className="border-t border-border pt-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Lock size={18} className="text-primary" />
            <h2 className="text-lg font-bold text-foreground">Alterar Senha</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Informe sua senha atual e defina uma nova senha.
          </p>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className={labelClass}>Senha Atual</label>
              <div className="relative">
                <input
                  type={showAtual ? "text" : "password"}
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  placeholder="••••••••"
                  className={inputClass}
                  required
                />
                <button type="button" onClick={() => setShowAtual(!showAtual)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(213,31%,55%)]">
                  {showAtual ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Nova Senha</label>
              <div className="relative">
                <input
                  type={showNova ? "text" : "password"}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={inputClass}
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowNova(!showNova)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(213,31%,55%)]">
                  {showNova ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass}>Confirmar Nova Senha</label>
              <div className="relative">
                <input
                  type={showConfirmar ? "text" : "password"}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Repita a nova senha"
                  className={inputClass}
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowConfirmar(!showConfirmar)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(213,31%,55%)]">
                  {showConfirmar ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={changingPassword || !senhaAtual || novaSenha.length < 6 || novaSenha !== confirmarSenha}
              className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-[hsl(217,91%,50%)] text-white font-semibold text-sm hover:bg-[hsl(217,91%,45%)] disabled:opacity-50 transition-colors"
            >
              {changingPassword ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              Alterar Senha
            </button>
          </form>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings size={16} />
            <span className="text-sm">Mais configurações em breve.</span>
          </div>
        </div>
      </div>
    </ColetorLayout>
  );
}
