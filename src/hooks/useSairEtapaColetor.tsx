import { useState } from "react";
import { SairEtapaSheet } from "@/components/coletor/SairEtapaSheet";
import {
  modoPadrao, precisaEscolherAoSair, sairEtapa, simularSairEtapa,
  type ParamsSair, type ResultadoSair,
} from "@/lib/sairEtapaService";

/**
 * "Sair da etapa" das listas do coletor (botão embaixo, como na separação).
 * Um toque devolve as tarefas; a folha de opções só aparece quando há o que decidir
 * (precisaEscolherAoSair). A regra continua no banco (rpc_coletor_sair_etapa).
 */
export function useSairEtapaColetor(params: ParamsSair | null, opcoes: {
  onSaiu: (r: ResultadoSair) => void;
  onErro: (e: unknown) => void;
}) {
  const [saindo, setSaindo] = useState(false);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const [previa, setPrevia] = useState<ResultadoSair | null>(null);

  const sair = async () => {
    if (!params) return;
    setSaindo(true);
    try {
      const previa = await simularSairEtapa(params);
      if (precisaEscolherAoSair(previa)) { setPrevia(previa); setFolhaAberta(true); return; }
      const r = await sairEtapa(params, modoPadrao(previa.resumo), null);
      if (!r.sucesso) { opcoes.onErro(r); return; }
      opcoes.onSaiu(r);
    } catch (e) {
      opcoes.onErro(e);
    } finally {
      setSaindo(false);
    }
  };

  const folha = (
    <SairEtapaSheet open={folhaAberta} params={params} previaInicial={previa} onClose={() => setFolhaAberta(false)}
      onSaiu={(r) => { setFolhaAberta(false); opcoes.onSaiu(r); }} />
  );

  return { sair, saindo, folha };
}
