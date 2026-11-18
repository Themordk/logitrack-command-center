import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FAIXAS_PADRAO_LISTA, classificar, estiloFaixa, intervalos, metaDe, type FaixaLms } from "../faixas";
import { validarFaixas } from "../configuracao/lmsConfig.service";
import { EditarFaixasDialog } from "../configuracao/EditarFaixasDialog";

const seis: FaixaLms[] = [
  { ordem: 1, codigo: "ELITE", nome: "Elite", cor: "roxo", a_partir_de_pct: 130, eh_meta: false },
  { ordem: 2, codigo: "OTIMO", nome: "Ótimo", cor: "verde", a_partir_de_pct: 110, eh_meta: false },
  { ordem: 3, codigo: "NA_META", nome: "Na meta", cor: "azul", a_partir_de_pct: 95, eh_meta: true },
  { ordem: 4, codigo: "PROXIMO", nome: "Próximo", cor: "ciano", a_partir_de_pct: 85, eh_meta: false },
  { ordem: 5, codigo: "ATENCAO", nome: "Atenção", cor: "amarelo", a_partir_de_pct: 70, eh_meta: false },
  { ordem: 6, codigo: "CRITICO", nome: "Crítico", cor: "vermelho", a_partir_de_pct: 0, eh_meta: false },
];

describe("Fase 7.5 · faixas configuráveis", () => {
  it("padrão reproduz as 4 faixas de antes", () => {
    expect(classificar(120).codigo).toBe("EXCELENTE");
    expect(classificar(110).codigo).toBe("EXCELENTE");
    expect(classificar(95).codigo).toBe("BOM");
    expect(classificar(70).codigo).toBe("ATENCAO");
    expect(classificar(10).codigo).toBe("CRITICO");
    expect(classificar(null).codigo).toBe("SEM_DADOS");
    expect(metaDe(FAIXAS_PADRAO_LISTA)).toBe(90);
  });

  it("classifica com conjunto personalizado e acha a meta", () => {
    expect(classificar(140, seis).nome).toBe("Elite");
    expect(classificar(96, seis).nome).toBe("Na meta");
    expect(classificar(84.9, seis).nome).toBe("Atenção");
    expect(metaDe(seis)).toBe(95);
    expect(intervalos(seis).map((i) => i.texto)).toEqual(["≥ 130%", "110–130%", "95–110%", "85–95%", "70–85%", "< 70%"]);
  });

  it("estilo usa a cor do banco e cai no legado sem ela", () => {
    expect(estiloFaixa("ELITE", "roxo", "Elite")).toMatchObject({ nome: "Elite", texto: "text-purple-400" });
    expect(estiloFaixa("BOM")).toMatchObject({ nome: "Bom", texto: "text-blue-400" });
  });

  it("valida o conjunto como o banco", () => {
    const base = [
      { nome: "Alta", cor: "verde" as const, a_partir_de_pct: 100, eh_meta: true },
      { nome: "Baixa", cor: "vermelho" as const, a_partir_de_pct: 0, eh_meta: false },
    ];
    expect(validarFaixas(base)).toBeNull();
    expect(validarFaixas([base[0]])).toMatch("2 a 6");
    expect(validarFaixas([base[0], { ...base[1], a_partir_de_pct: 10 }])).toMatch("0%");
    expect(validarFaixas([base[0], { ...base[1], eh_meta: true }])).toMatch("exatamente uma");
    expect(validarFaixas([base[0], { ...base[1], nome: "alta" }])).toMatch("repetido");
    expect(validarFaixas([base[0], { ...base[1], a_partir_de_pct: 100 }])).toMatch("mesmo percentual");
  });
});

describe("Fase 7.5 · editor de faixas", () => {
  const props = {
    aberto: true, nivelTela: "EMPRESA" as const, atual: FAIXAS_PADRAO_LISTA,
    herdado: { lista: FAIXAS_PADRAO_LISTA, nivel: "SISTEMA" as const }, temProprio: false,
    hoje: "2026-11-18", podeRetroativo: true, salvando: false, onCancelar: () => {},
  };

  it("renomeia, troca a meta e salva o conjunto", () => {
    const onSalvar = vi.fn();
    render(<EditarFaixasDialog {...props} onSalvar={onSalvar} />);
    fireEvent.change(screen.getByLabelText("Nome da faixa 2"), { target: { value: "Na meta" } });
    fireEvent.click(screen.getByLabelText("Marcar Excelente como meta"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const [faixas, vig] = onSalvar.mock.calls[0];
    expect(vig).toBe("2026-11-18");
    expect(faixas).toHaveLength(4);
    expect(faixas[1].nome).toBe("Na meta");
    expect(faixas.filter((f: { eh_meta: boolean }) => f.eh_meta).map((f: { nome: string }) => f.nome)).toEqual(["Excelente"]);
  });

  it("adiciona faixa e bloqueia até preencher", () => {
    render(<EditarFaixasDialog {...props} onSalvar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Adicionar faixa/ }));
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nome da faixa 5"), { target: { value: "Elite" } });
    fireEvent.change(screen.getByLabelText("A partir de (faixa 5)"), { target: { value: "130" } });
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    expect(screen.getByLabelText("Prévia da classificação")).toHaveTextContent("130% → Elite");
  });
});
