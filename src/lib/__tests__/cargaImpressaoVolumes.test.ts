import { describe, expect, it } from "vitest";
import { resumoImpressaoVolumes } from "@/lib/cargaExibicao";

describe("resumoImpressaoVolumes (embarque)", () => {
  it("todas na fila: confirma que foram para a impressora", () => {
    const r = resumoImpressaoVolumes([{ ok: true }, { ok: true }]);
    expect(r.aviso).toBeNull();
    expect(r.detalhe).toContain("foram para a impressora");
  });
  it("agente offline: avisa e mostra o motivo do banco", () => {
    const motivo = "Nenhuma impressora online no armazém para o setor GERAL. Verifique se o LogiTrack Print Agent está rodando.";
    const r = resumoImpressaoVolumes([1, 2, 3].map(() => ({ ok: false, codigo: "SEM_IMPRESSORA_ONLINE", mensagem: motivo })));
    expect(r.aviso).toBe("Etiquetas não impressas");
    expect(r.detalhe.split("\n")[0]).toBe(motivo);
    expect(r.detalhe).not.toContain("foram para a impressora");
  });
  it("sem impressora cadastrada também avisa", () => {
    const r = resumoImpressaoVolumes([{ ok: false, codigo: "SEM_IMPRESSORA_CADASTRADA", mensagem: "Nenhuma impressora cadastrada neste armazém" }]);
    expect(r.detalhe).toContain("Não há impressora cadastrada");
  });
  it("parte impressa: conta as que faltaram", () => {
    const r = resumoImpressaoVolumes([{ ok: true }, { ok: false, codigo: "IMPRESSORA_OFFLINE", mensagem: "Impressora X indisponível" }]);
    expect(r.aviso).toBe("1 de 2 etiqueta(s) não impressa(s)");
  });
});
