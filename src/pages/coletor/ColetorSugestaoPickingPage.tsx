import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { useFeedback } from "@/hooks/useFeedback";
import { toast } from "sonner";
import {
  Loader2,
  MapPin,
  PackageCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Star,
  CheckCircle2,
} from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
  // Dados que chegam do fluxo de recebimento (passados como props ou via contexto)
  produtoId?: string;
  produtoSku?: string;
  produtoDescricao?: string;
  lote?: string;
  validade?: string;
  quantidade?: number;
}

interface EnderecoSugerido {
  endereco_id: string;
  descricao: string;
  score: number;
  motivo: string;
  tipo_sugestao: string;
  saldo_atual: number;
  capacidade_livre: number | null;
  curva_acesso: string | null;
  rua: number;
  predio: number;
  nivel: number;
  apto: number;
}

interface ValidacaoResult {
  valido: boolean;
  erros: string[];
  endereco: {
    descricao: string;
    tipo_endereco: string;
    situacao: string;
    saldo_atual: number;
    capacidade: number | null;
  };
}

// Cores por tipo de sugestão
const TIPO_COLORS: Record<string, string> = {
  CONSOLIDACAO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CURVA_MATCH: "bg-green-500/15 text-green-400 border-green-500/30",
  ENDERECO_LIVRE: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  FALLBACK: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const TIPO_LABELS: Record<string, string> = {
  CONSOLIDACAO: "Consolidação",
  CURVA_MATCH: "Match de curva",
  ENDERECO_LIVRE: "Endereço livre",
  FALLBACK: "Fallback",
};

export function ColetorSugestaoPickingPage({
  onNavigate,
  produtoId,
  produtoSku,
  produtoDescricao,
  lote,
  validade,
  quantidade = 1,
}: Props) {
  const feedback = useFeedback();
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sugestoes, setSugestoes] = useState<EnderecoSugerido[]>([]);
  const [showAlternativas, setShowAlternativas] = useState(false);
  const [enderecoSelecionado, setEnderecoSelecionado] = useState<EnderecoSugerido | null>(null);
  const [enderecoManual, setEnderecoManual] = useState<string>("");
  const [modoManual, setModoManual] = useState(false);
  const [validacaoErros, setValidacaoErros] = useState<string[]>([]);

  // Buscar sugestões ao montar (se produtoId já está disponível)
  useEffect(() => {
    if (produtoId && tenantId && armazemId) {
      buscarSugestoes();
    }
  }, [produtoId, tenantId, armazemId]);

  const buscarSugestoes = useCallback(async () => {
    if (!tenantId || !armazemId || !produtoId) return;

    setLoading(true);
    setValidacaoErros([]);
    try {
      const { data, error } = await supabase.rpc(
        "rpc_sugerir_endereco_picking" as any,
        {
          p_tenant_id: tenantId,
          p_armazem_id: armazemId,
          p_produto_id: produtoId,
          p_lote: lote || null,
          p_validade: validade || null,
          p_quantidade: quantidade,
          p_limite: 5,
        }
      );

      if (error) throw error;

      const resultado = (data as unknown as EnderecoSugerido[]) || [];
      setSugestoes(resultado);

      if (resultado.length > 0) {
        setEnderecoSelecionado(resultado[0]);
        feedback.success();
      } else {
        setEnderecoSelecionado(null);
        setModoManual(true);
        toast.info("Nenhum endereço disponível encontrado. Informe um endereço manualmente.");
      }
    } catch (err: any) {
      feedback.error();
      toast.error(err.message || "Erro ao buscar sugestões");
    } finally {
      setLoading(false);
    }
  }, [tenantId, armazemId, produtoId, lote, validade, quantidade]);

  // Validar endereço escolhido manualmente via scan
  const handleScanEnderecoManual = async (codigoLido: string) => {
    if (!tenantId || !armazemId || !produtoId) return;

    setValidating(true);
    setValidacaoErros([]);
    try {
      // Primeiro, buscar o endereço pelo código/descrição
      const { data: enderecoData, error: enderecoError } = await supabase
        .from("endereco")
        .select("id, descricao, rua, predio, nivel, apto, curva_acesso, situacao")
        .eq("tenant_id", tenantId)
        .eq("armazem_id", armazemId)
        .or(`descricao.eq.${codigoLido},codigo_endereco.eq.${codigoLido}`)
        .maybeSingle();

      if (enderecoError) throw enderecoError;

      if (!enderecoData) {
        feedback.error();
        toast.error("Endereço não encontrado: " + codigoLido);
        return;
      }

      // Validar com a RPC
      const { data: validacao, error: validacaoError } = await supabase.rpc(
        "rpc_validar_endereco_picking" as any,
        {
          p_tenant_id: tenantId,
          p_armazem_id: armazemId,
          p_produto_id: produtoId,
          p_endereco_id: enderecoData.id,
          p_lote: lote || null,
          p_validade: validade || null,
          p_quantidade: quantidade,
        }
      );

      if (validacaoError) throw validacaoError;

      const resultado = validacao as unknown as ValidacaoResult;

      if (resultado.valido) {
        feedback.success();
        setEnderecoSelecionado({
          endereco_id: enderecoData.id,
          descricao: enderecoData.descricao,
          score: 0,
          motivo: "Seleção manual do operador",
          tipo_sugestao: "MANUAL",
          saldo_atual: resultado.endereco.saldo_atual,
          capacidade_livre: resultado.endereco.capacidade
            ? resultado.endereco.capacidade - resultado.endereco.saldo_atual
            : null,
          curva_acesso: enderecoData.curva_acesso,
          rua: enderecoData.rua,
          predio: enderecoData.predio,
          nivel: enderecoData.nivel,
          apto: enderecoData.apto,
        });
        setModoManual(false);
        setValidacaoErros([]);
        toast.success("Endereço validado: " + enderecoData.descricao);
      } else {
        feedback.error();
        setValidacaoErros(resultado.erros);
        toast.error("Endereço não permitido");
      }
    } catch (err: any) {
      feedback.error();
      toast.error(err.message || "Erro na validação");
    } finally {
      setValidating(false);
    }
  };

  // Confirmar a seleção de endereço e registrar o log
  const handleConfirmar = async () => {
    if (!enderecoSelecionado || !tenantId || !armazemId || !produtoId) return;

    setSaving(true);
    try {
      const sugestaoTop = sugestoes.length > 0 ? sugestoes[0] : null;
      const aceita = sugestaoTop
        ? enderecoSelecionado.endereco_id === sugestaoTop.endereco_id
        : null;

      // 1. Registrar log de sugestão
      const { error: logError } = await supabase
        .from("log_sugestao_armazenagem" as any)
        .insert({
          tenant_id: tenantId,
          empresa_id: empresaId,
          armazem_id: armazemId,
          produto_id: produtoId,
          endereco_sugerido_id: sugestaoTop?.endereco_id || enderecoSelecionado.endereco_id,
          endereco_escolhido_id: enderecoSelecionado.endereco_id,
          score: sugestaoTop?.score || 0,
          tipo_sugestao: (sugestaoTop?.tipo_sugestao || "FALLBACK") as any,
          motivo_sugestao: sugestaoTop?.motivo || "Seleção manual sem sugestão disponível",
          aceita: aceita,
          lote: lote || null,
          validade: validade || null,
          quantidade: quantidade,
          usuario_id: usuarioId,
        } as any);

      if (logError) {
        console.error("Erro ao registrar log de sugestão:", logError);
        // Não bloqueia — log é auditoria
      }

      // 2. Verificar se já existe picking_produto para este produto neste endereço
      const { data: pickingExistente, error: pickingCheckError } = await supabase
        .from("picking_produto")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("armazem_id", armazemId)
        .eq("produto_id", produtoId)
        .eq("endereco_id", enderecoSelecionado.endereco_id)
        .maybeSingle();

      if (pickingCheckError) throw pickingCheckError;

      if (!pickingExistente) {
        // 3. Criar picking_produto (se não existe)
        const { error: pickingError } = await supabase
          .from("picking_produto")
          .insert({
            tenant_id: tenantId,
            empresa_id: empresaId,
            armazem_id: armazemId,
            produto_id: produtoId,
            endereco_id: enderecoSelecionado.endereco_id,
            tipo_picking: "MASTER",
            est_minimo: 0,
            est_maximo: enderecoSelecionado.capacidade_livre || 9999,
            ativo: true,
            tipo_alocacao: "FIXO",
          } as any);

        if (pickingError) throw pickingError;
      }

      feedback.success();
      toast.success(
        `Endereço ${enderecoSelecionado.descricao} vinculado ao produto ${produtoSku || ""}!`
      );

      // Voltar para o fluxo anterior
      onNavigate("/coletor/recebimento");
    } catch (err: any) {
      feedback.error();
      toast.error(err.message || "Erro ao confirmar endereço");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ColetorLayout
      title="Sugestão de picking"
      onNavigate={onNavigate}
      showBack
      backPath="/coletor/recebimento"
    >
      <div className="space-y-4 px-3 pb-6">
        {/* Info do produto */}
        <div className="rounded-lg border border-border bg-[hsl(222,40%,12%)] p-3">
          <div className="flex items-center gap-2 mb-1">
            <PackageCheck className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-muted-foreground">Produto</span>
          </div>
          <p className="text-sm font-mono font-semibold text-foreground">
            {produtoSku || "—"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {produtoDescricao || "Produto não identificado"}
          </p>
          {(lote || validade) && (
            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
              {lote && <span>Lote: <strong className="text-foreground">{lote}</strong></span>}
              {validade && <span>Val: <strong className="text-foreground">{validade}</strong></span>}
            </div>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 className="animate-spin text-blue-400" size={32} />
            <span className="text-sm text-muted-foreground">Buscando endereço ideal...</span>
          </div>
        )}

        {/* Sugestão principal */}
        {!loading && enderecoSelecionado && !modoManual && (
          <div className="space-y-3">
            {/* Card do endereço sugerido */}
            <div className="rounded-lg border-2 border-green-500/40 bg-green-500/5 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">
                    {enderecoSelecionado === sugestoes[0]
                      ? "Endereço sugerido"
                      : "Endereço selecionado"}
                  </span>
                </div>
                {enderecoSelecionado.score > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="text-xs text-yellow-400 font-mono">
                      {enderecoSelecionado.score}pts
                    </span>
                  </div>
                )}
              </div>

              <p className="text-2xl font-mono font-bold text-foreground tracking-wide">
                {enderecoSelecionado.descricao}
              </p>

              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                    TIPO_COLORS[enderecoSelecionado.tipo_sugestao] || TIPO_COLORS.FALLBACK
                  }`}
                >
                  {TIPO_LABELS[enderecoSelecionado.tipo_sugestao] || enderecoSelecionado.tipo_sugestao}
                </span>
                {enderecoSelecionado.curva_acesso && (
                  <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border bg-purple-500/15 text-purple-400 border-purple-500/30">
                    Curva {enderecoSelecionado.curva_acesso}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                {enderecoSelecionado.motivo}
              </p>

              {enderecoSelecionado.saldo_atual > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Saldo atual: <strong className="text-foreground">{enderecoSelecionado.saldo_atual}</strong>
                  {enderecoSelecionado.capacidade_livre !== null && (
                    <> · Espaço livre: <strong className="text-foreground">{enderecoSelecionado.capacidade_livre}</strong></>
                  )}
                </p>
              )}
            </div>

            {/* Alternativas (colapsável) */}
            {sugestoes.length > 1 && (
              <div>
                <button
                  onClick={() => setShowAlternativas(!showAlternativas)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors w-full justify-center py-1"
                >
                  {showAlternativas ? (
                    <>
                      <ChevronUp className="h-3.5 w-3.5" />
                      Ocultar alternativas
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3.5 w-3.5" />
                      Ver {sugestoes.length - 1} alternativa{sugestoes.length > 2 ? "s" : ""}
                    </>
                  )}
                </button>

                {showAlternativas && (
                  <div className="space-y-2 mt-2">
                    {sugestoes.slice(1).map((sug) => (
                      <button
                        key={sug.endereco_id}
                        onClick={() => {
                          setEnderecoSelecionado(sug);
                          feedback.success();
                        }}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          enderecoSelecionado.endereco_id === sug.endereco_id
                            ? "border-blue-500/40 bg-blue-500/10"
                            : "border-border bg-[hsl(222,40%,12%)] hover:border-blue-500/20"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-mono font-semibold text-foreground">
                            {sug.descricao}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {sug.score}pts
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                              TIPO_COLORS[sug.tipo_sugestao] || TIPO_COLORS.FALLBACK
                            }`}
                          >
                            {TIPO_LABELS[sug.tipo_sugestao] || sug.tipo_sugestao}
                          </span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            {sug.motivo}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Botão para modo manual */}
            <button
              onClick={() => setModoManual(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 w-full text-center py-1"
            >
              Escolher outro endereço manualmente
            </button>
          </div>
        )}

        {/* Modo manual — scan de endereço */}
        {!loading && modoManual && (
          <div className="space-y-3">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-400" />
                <span className="text-xs text-yellow-400 font-medium">Seleção manual</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Leia o código de barras do endereço de picking desejado. O sistema validará
                se o endereço pode receber este produto.
              </p>
            </div>

            <ScanField
              label="Leia o endereço de picking"
              onScan={handleScanEnderecoManual}
              disabled={validating}
            />

            {validating && (
              <div className="flex items-center justify-center gap-2 py-2">
                <Loader2 className="animate-spin text-blue-400" size={20} />
                <span className="text-xs text-muted-foreground">Validando endereço...</span>
              </div>
            )}

            {/* Erros de validação */}
            {validacaoErros.length > 0 && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400 font-medium">Endereço não permitido</span>
                </div>
                {validacaoErros.map((erro, i) => (
                  <p key={i} className="text-xs text-red-300 pl-6">
                    • {erro}
                  </p>
                ))}
              </div>
            )}

            {/* Endereço manual validado com sucesso */}
            {enderecoSelecionado && !validating && validacaoErros.length === 0 && (
              <div className="rounded-lg border-2 border-green-500/40 bg-green-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">Endereço validado</span>
                </div>
                <p className="text-lg font-mono font-bold text-foreground">
                  {enderecoSelecionado.descricao}
                </p>
              </div>
            )}

            {/* Voltar para sugestão */}
            {sugestoes.length > 0 && (
              <button
                onClick={() => {
                  setModoManual(false);
                  setEnderecoSelecionado(sugestoes[0]);
                  setValidacaoErros([]);
                }}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2 w-full text-center py-1"
              >
                Voltar para sugestão do sistema
              </button>
            )}
          </div>
        )}

        {/* Botão de confirmação */}
        {enderecoSelecionado && !loading && (
          <div className="pt-2">
            <ActionButton
              label={saving ? "Confirmando..." : "Confirmar endereço"}
              onClick={handleConfirmar}
              variant="success"
              disabled={saving || validating}
            />
          </div>
        )}
      </div>
    </ColetorLayout>
  );
}
