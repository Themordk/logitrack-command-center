import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserCog, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { fetchTarefasPendentesOnda, type TarefaPendenteDetalhe } from "@/lib/operadoresAtribuidos";

interface Props {
  open: boolean;
  movimentoSaidaId: string | null;
  numeroOnda: number | null;
  tenantId: string | null;
  empresaId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface UsuarioOption {
  id: string;
  nome: string;
  login: string;
}

export function ReatribuirTarefasModal({
  open,
  movimentoSaidaId,
  numeroOnda,
  tenantId,
  empresaId,
  onClose,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tarefas, setTarefas] = useState<TarefaPendenteDetalhe[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [selectedOperadores, setSelectedOperadores] = useState<Set<string>>(new Set());
  const [novoUsuarioId, setNovoUsuarioId] = useState<string>("");
  const [confirmarEmAndamento, setConfirmarEmAndamento] = useState(false);

  // agrupa por operador atual
  const grupos = useMemo(() => {
    const map = new Map<string, TarefaPendenteDetalhe[]>();
    tarefas.forEach((t) => {
      if (!map.has(t.usuario_id)) map.set(t.usuario_id, []);
      map.get(t.usuario_id)!.push(t);
    });
    return Array.from(map.entries()).map(([usuarioId, lista]) => ({
      usuarioId,
      nome: lista[0].usuario_nome,
      tarefas: lista,
      emAndamento: lista.filter((l) => l.iniciado_em).length,
    }));
  }, [tarefas]);

  const tarefasSelecionadas = useMemo(
    () => tarefas.filter((t) => selectedOperadores.has(t.usuario_id)),
    [tarefas, selectedOperadores],
  );

  const totalEmAndamentoSelecionado = tarefasSelecionadas.filter((t) => t.iniciado_em).length;

  useEffect(() => {
    if (!open || !movimentoSaidaId || !tenantId) return;
    setLoading(true);
    setSelectedOperadores(new Set());
    setNovoUsuarioId("");
    setConfirmarEmAndamento(false);

    Promise.all([
      fetchTarefasPendentesOnda(tenantId, movimentoSaidaId),
      (async () => {
        let q = (supabase as any)
          .from("usuario")
          .select("id, nome, login")
          .eq("tenant_id", tenantId)
          .eq("ativo", true)
          .order("nome");
        if (empresaId) q = q.eq("empresa_id", empresaId);
        const { data } = await q;
        return data || [];
      })(),
    ])
      .then(([tList, uList]) => {
        setTarefas(tList);
        setUsuarios(uList);
        // pré-seleciona o único operador, se houver apenas um
        const uniq = new Set(tList.map((t) => t.usuario_id));
        if (uniq.size === 1) setSelectedOperadores(uniq);
      })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }, [open, movimentoSaidaId, tenantId, empresaId]);

  const toggleOperador = (usuarioId: string) => {
    setSelectedOperadores((prev) => {
      const next = new Set(prev);
      if (next.has(usuarioId)) next.delete(usuarioId);
      else next.add(usuarioId);
      return next;
    });
  };

  const handleConfirmar = async () => {
    if (!novoUsuarioId) {
      toast.error("Selecione o novo operador.");
      return;
    }
    if (tarefasSelecionadas.length === 0) {
      toast.error("Selecione ao menos um operador atual para reatribuir.");
      return;
    }
    if (totalEmAndamentoSelecionado > 0 && !confirmarEmAndamento) {
      toast.warning(
        `${totalEmAndamentoSelecionado} tarefa(s) já iniciada(s). Marque a confirmação para prosseguir.`,
      );
      return;
    }
    // não reatribuir para o mesmo usuário atual
    const conflitos = tarefasSelecionadas.filter((t) => t.usuario_id === novoUsuarioId);
    if (conflitos.length > 0) {
      toast.error("O novo operador já é o operador atual de alguma das tarefas selecionadas.");
      return;
    }

    setSaving(true);
    const agora = new Date().toISOString();
    let sucesso = 0;
    const erros: string[] = [];

    try {
      for (const t of tarefasSelecionadas) {
        // 1) libera (encerra) a atribuição atual do usuário antigo
        const { error: cancelErr } = await (supabase as any)
          .from("tarefa_atribuicao")
          .update({ status: "LIBERADA", liberado_em: agora })
          .eq("id", t.tarefa_atribuicao_id);
        if (cancelErr) {
          erros.push(`Liberar ${t.tarefa_id}: ${cancelErr.message}`);
          continue;
        }
        // 2) cria nova atribuição para o novo usuário
        const { error: insErr } = await (supabase as any)
          .from("tarefa_atribuicao")
          .insert({
            tarefa_id: t.tarefa_id,
            usuario_id: novoUsuarioId,
            status: "ATRIBUIDA",
            atribuido_em: agora,
            tenant_id: tenantId,
            empresa_id: empresaId,
            tipo_convocacao: "CONVOCACAO_GESTOR",
          });
        if (insErr) {
          erros.push(`Criar ${t.tarefa_id}: ${insErr.message}`);
          continue;
        }
        sucesso++;
      }

      const novoNome = usuarios.find((u) => u.id === novoUsuarioId)?.nome || "operador";
      if (sucesso > 0) {
        toast.success(`${sucesso} tarefa(s) reatribuída(s) para ${novoNome}.`);
      }
      if (erros.length > 0) {
        toast.error(`Falhas: ${erros.length}. Verifique o console.`);
        console.error("Erros reatribuição:", erros);
      }
      if (sucesso > 0) {
        onSuccess();
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog size={18} className="text-primary" />
            Reatribuir tarefas{numeroOnda ? ` — Onda #${numeroOnda}` : ""}
          </DialogTitle>
          <DialogDescription>
            Selecione os operadores cujas tarefas pendentes devem ser transferidas e o novo responsável.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : tarefas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nenhuma tarefa pendente nesta onda.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                Operadores atuais
              </p>
              <div className="space-y-1.5 max-h-60 overflow-auto rounded-md border border-border p-2">
                {grupos.map((g) => (
                  <label
                    key={g.usuarioId}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/40 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedOperadores.has(g.usuarioId)}
                      onCheckedChange={() => toggleOperador(g.usuarioId)}
                    />
                    <span className="text-sm text-foreground flex-1">{g.nome}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                      {g.tarefas.length} tarefa{g.tarefas.length > 1 ? "s" : ""}
                    </span>
                    {g.emAndamento > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                        <AlertTriangle size={10} /> {g.emAndamento} em andamento
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">
                Novo operador
              </p>
              <Select value={novoUsuarioId} onValueChange={setNovoUsuarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o novo operador..." />
                </SelectTrigger>
                <SelectContent>
                  {usuarios.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.nome} <span className="text-muted-foreground">({u.login})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {totalEmAndamentoSelecionado > 0 && (
              <label className="flex items-start gap-2 p-2 rounded-md bg-orange-500/10 border border-orange-500/30 cursor-pointer">
                <Checkbox
                  checked={confirmarEmAndamento}
                  onCheckedChange={(v) => setConfirmarEmAndamento(!!v)}
                  className="mt-0.5"
                />
                <span className="text-xs text-orange-300">
                  Confirmo cancelar o progresso de <strong>{totalEmAndamentoSelecionado}</strong>{" "}
                  tarefa(s) já iniciada(s). Uma nova execução zerada será criada para o novo operador.
                </span>
              </label>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={saving || loading || tarefas.length === 0}
          >
            {saving && <Loader2 size={14} className="animate-spin mr-1" />}
            Confirmar reatribuição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
