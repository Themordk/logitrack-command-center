/**
 * Fluxo de Expedição · F6.1 — campos de transporte da carga (veículo próprio ou transportadora).
 * Usado na "Nova carga" e no detalhe da carga. Só coleta os dados; quem valida é carga_montar.
 */
import { Building2, Truck } from "lucide-react";
import type { ModalidadeTransporte, TransportadoraOpcao } from "@/lib/cargaService";
import { MODALIDADE_LABEL, nomeTransportadora, placaValida, type TransporteValor } from "@/lib/cargaExibicao";
import type { VeiculoOpcao } from "@/hooks/useCargaCadastros";

interface Props {
  idPrefixo: string;
  valor: TransporteValor;
  onChange: (v: TransporteValor) => void;
  veiculos: VeiculoOpcao[];
  transportadoras: TransportadoraOpcao[];
  /** Tudo somente leitura (perfil de consulta ou carga encerrada). */
  desabilitado?: boolean;
  /** Carga em carregamento: modalidade, veículo e transportadora ficam travados; placa e motorista seguem editáveis. */
  travarTransporte?: boolean;
  /** Rótulo do vazio do veículo (ex.: "Usar o veículo das ondas"). */
  rotuloVeiculoVazio?: string;
  /** Rótulo do vazio da transportadora (ex.: "Usar a transportadora dos pedidos (ALFA)"). */
  rotuloTransportadoraVazio?: string;
}

const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";
const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5";

const OPCOES: { valor: ModalidadeTransporte; icone: typeof Truck }[] = [
  { valor: "PROPRIA", icone: Truck },
  { valor: "TERCEIRO", icone: Building2 },
];

export function TransporteCampos({
  idPrefixo, valor, onChange, veiculos, transportadoras, desabilitado, travarTransporte,
  rotuloVeiculoVazio = "Selecione…", rotuloTransportadoraVazio = "Selecione…",
}: Props) {
  const set = (p: Partial<TransporteValor>) => onChange({ ...valor, ...p });
  const terceiro = valor.modalidade === "TERCEIRO";
  const placaInvalida = terceiro && valor.placa.trim().length > 0 && !placaValida(valor.placa);

  return (
    <div className="space-y-3">
      <div>
        <span id={`${idPrefixo}-modalidade`} className={labelClass}>Transporte</span>
        <div role="radiogroup" aria-labelledby={`${idPrefixo}-modalidade`} className="grid grid-cols-2 gap-1 p-1 rounded-lg border border-border bg-secondary/30">
          {OPCOES.map(({ valor: v, icone: Icone }) => {
            const ativo = valor.modalidade === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={ativo}
                disabled={desabilitado || travarTransporte}
                onClick={() => set({ modalidade: v })}
                className={`h-9 rounded-md text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:cursor-not-allowed ${
                  ativo ? "bg-primary/15 text-primary border border-primary/40" : "text-muted-foreground hover:text-foreground border border-transparent"}`}
              >
                <Icone size={14} aria-hidden="true" /> {MODALIDADE_LABEL[v]}
              </button>
            );
          })}
        </div>
      </div>

      {!terceiro ? (
        <div>
          <label htmlFor={`${idPrefixo}-veiculo`} className={labelClass}>Veículo próprio *</label>
          <select id={`${idPrefixo}-veiculo`} className={inputClass} value={valor.veiculoId} disabled={desabilitado || travarTransporte}
            onChange={(e) => set({ veiculoId: e.target.value })}>
            <option value="">{rotuloVeiculoVazio}</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.descricao}{v.placa ? ` - ${v.placa}` : ""}</option>)}
          </select>
          {veiculos.length === 0 && (
            <p className="text-xs text-muted-foreground mt-1">Nenhum veículo próprio ativo cadastrado para esta empresa.</p>
          )}
        </div>
      ) : (
        <>
          <div>
            <label htmlFor={`${idPrefixo}-transportadora`} className={labelClass}>Transportadora *</label>
            <select id={`${idPrefixo}-transportadora`} className={inputClass} value={valor.transportadoraId} disabled={desabilitado || travarTransporte}
              onChange={(e) => set({ transportadoraId: e.target.value })}>
              <option value="">{rotuloTransportadoraVazio}</option>
              {transportadoras.map((t) => (
                <option key={t.id} value={t.id}>{nomeTransportadora(t)}{t.cnpj ? ` - ${t.cnpj}` : ""}</option>
              ))}
            </select>
            {transportadoras.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhuma transportadora ativa. Cadastre o parceiro com Tipo de Parceiro = Transportador em Dados Mestres › Parceiros.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idPrefixo}-placa`} className={labelClass}>Placa</label>
              <input id={`${idPrefixo}-placa`} className={`${inputClass} font-mono uppercase`} value={valor.placa} maxLength={8}
                disabled={desabilitado} placeholder="ABC1D23" aria-invalid={placaInvalida} aria-describedby={`${idPrefixo}-placa-ajuda`}
                onChange={(e) => set({ placa: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label htmlFor={`${idPrefixo}-motorista-doc`} className={labelClass}>Documento do motorista</label>
              <input id={`${idPrefixo}-motorista-doc`} className={inputClass} value={valor.motoristaDocumento} maxLength={30}
                disabled={desabilitado} placeholder="CPF ou CNH" onChange={(e) => set({ motoristaDocumento: e.target.value })} />
            </div>
          </div>
          <p id={`${idPrefixo}-placa-ajuda`} className={`text-xs ${placaInvalida ? "text-yellow-400" : "text-muted-foreground"}`}>
            {placaInvalida ? "A placa não parece estar no padrão AAA9999 ou AAA9A99." : "Placa, motorista e documento podem ser informados até o fechamento da carga."}
          </p>
        </>
      )}

      <div>
        <label htmlFor={`${idPrefixo}-motorista`} className={labelClass}>Motorista</label>
        <input id={`${idPrefixo}-motorista`} className={inputClass} value={valor.motorista} maxLength={120} disabled={desabilitado}
          onChange={(e) => set({ motorista: e.target.value })} />
      </div>
    </div>
  );
}
