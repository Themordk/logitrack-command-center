import { useState } from "react";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { EnderecosPage } from "./pages/EnderecosPage";
import { HUsPage } from "./pages/HUsPage";
import { VolumesPage } from "./pages/VolumesPage";
import { VeiculosPage } from "./pages/VeiculosPage";
import { ProdutosPage } from "./pages/ProdutosPage";
import { ArmazemPage } from "./pages/ArmazemPage";
import { RastreabilidadePage } from "./pages/RastreabilidadePage";

const breadcrumbs: Record<string, { label: string; path?: string }[]> = {
  "/": [{ label: "CORE LogiTrack" }, { label: "Dashboard" }],
  "/rastreabilidade": [{ label: "CORE LogiTrack" }, { label: "Rastreabilidade" }],
  "/armazem/armazens": [{ label: "CORE LogiTrack" }, { label: "Armazém", path: "/armazem/armazens" }, { label: "Armazéns" }],
  "/armazem/setores": [{ label: "CORE LogiTrack" }, { label: "Armazém", path: "/armazem/armazens" }, { label: "Setores" }],
  "/armazem/tipos-estoque": [{ label: "CORE LogiTrack" }, { label: "Armazém", path: "/armazem/armazens" }, { label: "Tipos de Estoque" }],
  "/armazem/enderecos": [{ label: "CORE LogiTrack" }, { label: "Armazém", path: "/armazem/armazens" }, { label: "Endereços" }],
  "/armazem/veiculos": [{ label: "CORE LogiTrack" }, { label: "Armazém", path: "/armazem/armazens" }, { label: "Veículos" }],
  "/atividades/hus": [{ label: "CORE LogiTrack" }, { label: "Atividades", path: "/atividades/hus" }, { label: "HUs" }],
  "/atividades/volumes": [{ label: "CORE LogiTrack" }, { label: "Atividades", path: "/atividades/hus" }, { label: "Volumes Expedição" }],
  "/dados-mestres/produtos": [{ label: "CORE LogiTrack" }, { label: "Dados Mestres", path: "/dados-mestres/produtos" }, { label: "Produtos" }],
};

function renderPage(path: string, onNavigate: (p: string) => void) {
  switch (path) {
    case "/":
      return <Dashboard onNavigate={onNavigate} />;
    case "/rastreabilidade":
      return <RastreabilidadePage />;
    case "/armazem/armazens":
      return <ArmazemPage sub="armazens" />;
    case "/armazem/setores":
      return <ArmazemPage sub="setores" />;
    case "/armazem/tipos-estoque":
      return <ArmazemPage sub="tipos" />;
    case "/armazem/enderecos":
      return <EnderecosPage />;
    case "/armazem/veiculos":
      return <VeiculosPage />;
    case "/atividades/hus":
      return <HUsPage />;
    case "/atividades/volumes":
      return <VolumesPage />;
    case "/dados-mestres/produtos":
      return <ProdutosPage />;
    default: {
      const label = path.split("/").pop()?.replace(/-/g, " ") ?? path;
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🚧</span>
          </div>
          <h2 className="text-lg font-semibold text-foreground capitalize mb-2">{label}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Esta tela está em desenvolvimento. A estrutura e dados mockados serão adicionados em breve.
          </p>
          <button
            onClick={() => onNavigate("/")}
            className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Voltar ao Dashboard
          </button>
        </div>
      );
    }
  }
}

export default function App() {
  const [currentPath, setCurrentPath] = useState("/");

  const bc = breadcrumbs[currentPath] ?? [
    { label: "CORE LogiTrack" },
    { label: currentPath.split("/").pop()?.replace(/-/g, " ") ?? "Página" },
  ];

  return (
    <Layout currentPath={currentPath} breadcrumb={bc} onNavigate={setCurrentPath}>
      {renderPage(currentPath, setCurrentPath)}
    </Layout>
  );
}
