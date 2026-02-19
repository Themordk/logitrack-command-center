// Comprehensive mock data for CORE LogiTrack WMS

export const mockArmazens = [
  { id: 1, codigo: "ARM-001", descricao: "Armazém Central SP", cidade: "São Paulo", uf: "SP", capacidade: 5000, status: "ativo" },
  { id: 2, codigo: "ARM-002", descricao: "Armazém Sul RS", cidade: "Porto Alegre", uf: "RS", capacidade: 3200, status: "ativo" },
  { id: 3, codigo: "ARM-003", descricao: "Armazém NE BA", cidade: "Salvador", uf: "BA", capacidade: 2800, status: "inativo" },
];

export const mockTiposEstoque = [
  { id: 1, codigo: "TE-001", descricao: "Estoque Regular", sigla: "REG", status: "ativo" },
  { id: 2, codigo: "TE-002", descricao: "Estoque Bloqueado", sigla: "BLQ", status: "ativo" },
  { id: 3, codigo: "TE-003", descricao: "Estoque Quarentena", sigla: "QRT", status: "ativo" },
  { id: 4, codigo: "TE-004", descricao: "Estoque Avariado", sigla: "AVR", status: "inativo" },
];

export const mockSetores = [
  { id: 1, codigo: "SET-001", descricao: "Setor A – Recebimento", armazem: "ARM-001", tipo: "Entrada", status: "ativo" },
  { id: 2, codigo: "SET-002", descricao: "Setor B – Armazenagem", armazem: "ARM-001", tipo: "Armazenagem", status: "ativo" },
  { id: 3, codigo: "SET-003", descricao: "Setor C – Picking", armazem: "ARM-001", tipo: "Saída", status: "ativo" },
  { id: 4, codigo: "SET-004", descricao: "Setor D – Expedição", armazem: "ARM-001", tipo: "Saída", status: "ativo" },
  { id: 5, codigo: "SET-005", descricao: "Setor E – Devolução", armazem: "ARM-002", tipo: "Entrada", status: "ativo" },
];

export const mockEstruturas = [
  { id: 1, codigo: "EST-001", descricao: "Porta-Pallet Duplo", tipo: "Porta-Pallet", largura: 2.7, altura: 8.5, profundidade: 1.1, status: "ativo" },
  { id: 2, codigo: "EST-002", descricao: "Drive-In 4 Profundidades", tipo: "Drive-In", largura: 2.7, altura: 6.0, profundidade: 4.4, status: "ativo" },
  { id: 3, codigo: "EST-003", descricao: "Cantilever", tipo: "Cantilever", largura: 3.0, altura: 5.0, profundidade: 1.5, status: "inativo" },
];

export type EnderecoSituacao = 0 | 1 | 2;
export type EnderecoTipo = 0 | 1;
export type CurvaAcesso = "A" | "B" | "C" | "D";

export interface Endereco {
  id: number;
  codigo: string;
  rua: number;
  posicao: number;
  nivel: number;
  apartamento: number;
  tipoEndereco: EnderecoTipo;
  situacao: EnderecoSituacao;
  capacidadeM3: number;
  pesoMaxKg: number;
  totalPallets: number;
  curva: CurvaAcesso;
  setor: string;
}

export const mockEnderecos: Endereco[] = [
  { id: 1, codigo: "R01-P01-N01-A01", rua: 1, posicao: 1, nivel: 1, apartamento: 1, tipoEndereco: 1, situacao: 0, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "A", setor: "SET-002" },
  { id: 2, codigo: "R01-P01-N02-A01", rua: 1, posicao: 1, nivel: 2, apartamento: 1, tipoEndereco: 0, situacao: 1, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "B", setor: "SET-002" },
  { id: 3, codigo: "R01-P02-N01-A01", rua: 1, posicao: 2, nivel: 1, apartamento: 1, tipoEndereco: 0, situacao: 1, capacidadeM3: 3.6, pesoMaxKg: 2000, totalPallets: 3, curva: "A", setor: "SET-002" },
  { id: 4, codigo: "R01-P02-N02-A01", rua: 1, posicao: 2, nivel: 2, apartamento: 1, tipoEndereco: 0, situacao: 2, capacidadeM3: 3.6, pesoMaxKg: 2000, totalPallets: 3, curva: "C", setor: "SET-002" },
  { id: 5, codigo: "R02-P01-N01-A01", rua: 2, posicao: 1, nivel: 1, apartamento: 1, tipoEndereco: 1, situacao: 0, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "A", setor: "SET-003" },
  { id: 6, codigo: "R02-P01-N02-A01", rua: 2, posicao: 1, nivel: 2, apartamento: 1, tipoEndereco: 1, situacao: 0, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "B", setor: "SET-003" },
  { id: 7, codigo: "R02-P02-N01-A01", rua: 2, posicao: 2, nivel: 1, apartamento: 1, tipoEndereco: 0, situacao: 1, capacidadeM3: 4.8, pesoMaxKg: 2500, totalPallets: 4, curva: "D", setor: "SET-002" },
  { id: 8, codigo: "R03-P01-N01-A01", rua: 3, posicao: 1, nivel: 1, apartamento: 1, tipoEndereco: 0, situacao: 0, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "C", setor: "SET-002" },
  { id: 9, codigo: "R03-P01-N02-A01", rua: 3, posicao: 1, nivel: 2, apartamento: 1, tipoEndereco: 0, situacao: 2, capacidadeM3: 2.4, pesoMaxKg: 1500, totalPallets: 2, curva: "A", setor: "SET-002" },
  { id: 10, codigo: "R03-P02-N01-A01", rua: 3, posicao: 2, nivel: 1, apartamento: 1, tipoEndereco: 0, situacao: 0, capacidadeM3: 3.6, pesoMaxKg: 2000, totalPallets: 3, curva: "B", setor: "SET-002" },
];

export type HUSituacao = 0 | 1 | 2 | 3 | 4;
export type HUTipo = "Pallet" | "Caixa" | "Volume" | "Outro";

export interface HU {
  id: number;
  codigoHU: string;
  sscc: string;
  tipoHU: HUTipo;
  pesoBruto: number;
  m3: number;
  disponibilidade: HUSituacao;
  endereco: string;
  produto: string;
  dataEntrada: string;
  quantidade: number;
}

export const mockHUs: HU[] = [
  { id: 1, codigoHU: "HU-00001", sscc: "00340000123456789012", tipoHU: "Pallet", pesoBruto: 850.5, m3: 1.8, disponibilidade: 0, endereco: "R01-P01-N01-A01", produto: "Eletrônicos – Notebook Pro", dataEntrada: "2024-01-15", quantidade: 24 },
  { id: 2, codigoHU: "HU-00002", sscc: "00340000123456789013", tipoHU: "Pallet", pesoBruto: 1200.0, m3: 2.1, disponibilidade: 1, endereco: "R01-P01-N02-A01", produto: "Periféricos – Mouse Wireless", dataEntrada: "2024-01-16", quantidade: 96 },
  { id: 3, codigoHU: "HU-00003", sscc: "00340000123456789014", tipoHU: "Caixa", pesoBruto: 45.2, m3: 0.3, disponibilidade: 3, endereco: "Em trânsito", produto: "Acessórios – Cabo HDMI", dataEntrada: "2024-01-17", quantidade: 200 },
  { id: 4, codigoHU: "HU-00004", sscc: "00340000123456789015", tipoHU: "Volume", pesoBruto: 12.5, m3: 0.1, disponibilidade: 2, endereco: "R01-P02-N02-A01", produto: "Eletrônicos – Teclado Mecânico", dataEntrada: "2024-01-18", quantidade: 12 },
  { id: 5, codigoHU: "HU-00005", sscc: "00340000123456789016", tipoHU: "Pallet", pesoBruto: 980.0, m3: 2.4, disponibilidade: 0, endereco: "R02-P01-N01-A01", produto: "Mobiliário – Cadeira Ergonômica", dataEntrada: "2024-01-19", quantidade: 8 },
  { id: 6, codigoHU: "HU-00006", sscc: "00340000123456789017", tipoHU: "Pallet", pesoBruto: 1450.0, m3: 2.8, disponibilidade: 1, endereco: "R02-P02-N01-A01", produto: "Eletrônicos – Monitor 27\"", dataEntrada: "2024-01-20", quantidade: 16 },
  { id: 7, codigoHU: "HU-00007", sscc: "00340000123456789018", tipoHU: "Caixa", pesoBruto: 78.3, m3: 0.5, disponibilidade: 4, endereco: "—", produto: "Descartado – Avariado", dataEntrada: "2024-01-21", quantidade: 0 },
  { id: 8, codigoHU: "HU-00008", sscc: "00340000123456789019", tipoHU: "Volume", pesoBruto: 32.0, m3: 0.2, disponibilidade: 3, endereco: "Em Movimento", produto: "Acessórios – Headset USB", dataEntrada: "2024-01-22", quantidade: 48 },
];

export type VolumeStatus = 0 | 1 | 2 | 3;

export interface VolumeExpedicao {
  id: number;
  codigoVolume: string;
  pedido: string;
  cliente: string;
  produto: string;
  quantidade: number;
  peso: number;
  status: VolumeStatus;
  previsaoExpedicao: string;
  rota: string;
}

export const mockVolumes: VolumeExpedicao[] = [
  { id: 1, codigoVolume: "VOL-2024-001", pedido: "PED-10001", cliente: "Tech Solutions Ltda", produto: "Notebook Pro X1", quantidade: 5, peso: 12.5, status: 0, previsaoExpedicao: "2024-01-25", rota: "RTA-SP-01" },
  { id: 2, codigoVolume: "VOL-2024-002", pedido: "PED-10002", cliente: "Mega Distribuidora", produto: "Mouse Wireless MX", quantidade: 50, peso: 8.0, status: 1, previsaoExpedicao: "2024-01-24", rota: "RTA-SP-02" },
  { id: 3, codigoVolume: "VOL-2024-003", pedido: "PED-10003", cliente: "InformaPC", produto: "Teclado Mecânico K8", quantidade: 20, peso: 15.0, status: 2, previsaoExpedicao: "2024-01-23", rota: "RTA-RJ-01" },
  { id: 4, codigoVolume: "VOL-2024-004", pedido: "PED-10004", cliente: "Grupo Alpha Tech", produto: "Monitor 27\" 4K", quantidade: 8, peso: 48.0, status: 3, previsaoExpedicao: "2024-01-22", rota: "RTA-MG-01" },
  { id: 5, codigoVolume: "VOL-2024-005", pedido: "PED-10005", cliente: "Conecta Brasil", produto: "Cabo HDMI 2.1", quantidade: 200, peso: 6.0, status: 0, previsaoExpedicao: "2024-01-26", rota: "RTA-SP-01" },
  { id: 6, codigoVolume: "VOL-2024-006", pedido: "PED-10006", cliente: "Delta Sistemas", produto: "Headset USB Pro", quantidade: 30, peso: 18.0, status: 1, previsaoExpedicao: "2024-01-25", rota: "RTA-RS-01" },
];

export const mockProdutos = [
  { id: 1, sku: "ELT-001", descricao: "Notebook Pro X1", grupo: "Eletrônicos", subgrupo: "Computadores", unidade: "UN", pesoBruto: 2.5, m3: 0.04, status: "ativo" },
  { id: 2, sku: "ELT-002", descricao: "Mouse Wireless MX", grupo: "Eletrônicos", subgrupo: "Periféricos", unidade: "UN", pesoBruto: 0.16, m3: 0.001, status: "ativo" },
  { id: 3, sku: "ELT-003", descricao: "Teclado Mecânico K8", grupo: "Eletrônicos", subgrupo: "Periféricos", unidade: "UN", pesoBruto: 0.75, m3: 0.003, status: "ativo" },
  { id: 4, sku: "ELT-004", descricao: "Monitor 27\" 4K", grupo: "Eletrônicos", subgrupo: "Monitores", unidade: "UN", pesoBruto: 6.0, m3: 0.08, status: "ativo" },
  { id: 5, sku: "ACS-001", descricao: "Cabo HDMI 2.1 2m", grupo: "Acessórios", subgrupo: "Cabos", unidade: "UN", pesoBruto: 0.03, m3: 0.0005, status: "ativo" },
];

export const mockParceiros = [
  { id: 1, codigo: "PAR-001", razaoSocial: "Tech Solutions Ltda", cnpj: "12.345.678/0001-90", tipo: "Cliente", cidade: "São Paulo", uf: "SP", status: "ativo" },
  { id: 2, codigo: "PAR-002", razaoSocial: "Mega Distribuidora S/A", cnpj: "98.765.432/0001-10", tipo: "Cliente", cidade: "Campinas", uf: "SP", status: "ativo" },
  { id: 3, codigo: "PAR-003", razaoSocial: "Fornecedor Prime Ltda", cnpj: "11.222.333/0001-44", tipo: "Fornecedor", cidade: "Guarulhos", uf: "SP", status: "ativo" },
];

export const mockVeiculos = [
  { id: 1, placa: "ABC-1234", tipo: "Truck 3/4", motorista: "Carlos Oliveira", capacidadeKg: 8000, capacidadeM3: 30, status: "disponivel" },
  { id: 2, placa: "DEF-5678", tipo: "Carreta LS", motorista: "João Silva", capacidadeKg: 25000, capacidadeM3: 90, status: "em_rota" },
  { id: 3, placa: "GHI-9012", tipo: "Van", motorista: "Marcos Santos", capacidadeKg: 1500, capacidadeM3: 8, status: "manutencao" },
  { id: 4, placa: "JKL-3456", tipo: "Truck 3/4", motorista: "Roberto Costa", capacidadeKg: 8000, capacidadeM3: 30, status: "disponivel" },
];

export const mockMovimentacoes = [
  { id: 1, hu: "HU-00003", tipo: "Movimentação", origem: "R01-P01-N01-A01", destino: "R03-P02-N01-A01", usuario: "Ana Pereira", dataHora: "2024-01-22 14:32", status: "em_andamento" },
  { id: 2, hu: "HU-00006", tipo: "Recebimento", origem: "Doca 3", destino: "R02-P02-N01-A01", usuario: "Bruno Lima", dataHora: "2024-01-22 13:15", status: "concluido" },
  { id: 3, hu: "HU-00001", tipo: "Separação", origem: "R01-P01-N01-A01", destino: "Staging Area", usuario: "Carla Souza", dataHora: "2024-01-22 11:45", status: "concluido" },
  { id: 4, hu: "HU-00008", tipo: "Movimentação", origem: "R01-P02-N01-A01", destino: "Doca 1", usuario: "Daniel Ramos", dataHora: "2024-01-22 10:00", status: "em_andamento" },
  { id: 5, hu: "HU-00002", tipo: "Expedição", origem: "Staging Area", destino: "Veículo DEF-5678", usuario: "Eduardo Neves", dataHora: "2024-01-22 09:30", status: "concluido" },
];

// Dashboard stats
export const dashboardStats = {
  totalHUs: 847,
  husDisponiveis: 312,
  husReservadas: 198,
  husBloqueadas: 45,
  husEmMovimento: 87,
  husDescartadas: 205,
  enderecos: {
    total: 2400,
    livres: 1248,
    ocupados: 984,
    bloqueados: 168,
  },
  volumesExpedicao: {
    abertos: 127,
    fechados: 43,
    conferidos: 28,
    expedidos: 312,
  },
  movimentacoesHoje: 156,
  alertasAtivos: 7,
  ocupacaoPercentual: 59,
};

// Rastreabilidade timeline mock
export const mockRastreabilidade = {
  hu: "HU-00001",
  sscc: "00340000123456789012",
  produto: "Notebook Pro X1",
  pedido: "PED-10001",
  eventos: [
    {
      id: 1,
      tipo: "Recebimento",
      descricao: "HU recebida na doca",
      usuario: "Bruno Lima",
      dataHora: "2024-01-15 08:15:00",
      localizacao: "Doca 02 – Recebimento",
      grupoOperacional: "Equipe Recebimento A",
      status: "concluido",
      detalhes: "NF-e 45678 – Fornecedor Prime Ltda",
    },
    {
      id: 2,
      tipo: "Conferência",
      descricao: "Conferência física realizada",
      usuario: "Ana Pereira",
      dataHora: "2024-01-15 09:30:00",
      localizacao: "Área de Conferência",
      grupoOperacional: "Equipe Qualidade",
      status: "concluido",
      detalhes: "24 unidades conferidas – sem divergência",
    },
    {
      id: 3,
      tipo: "Armazenagem",
      descricao: "HU armazenada no endereço",
      usuario: "Carlos Oliveira",
      dataHora: "2024-01-15 11:00:00",
      localizacao: "R01-P01-N01-A01",
      grupoOperacional: "Equipe Armazenagem B",
      status: "concluido",
      detalhes: "Endereço Picking – Curva A",
    },
    {
      id: 4,
      tipo: "Separação",
      descricao: "Separação para pedido",
      usuario: "Carla Souza",
      dataHora: "2024-01-22 11:45:00",
      localizacao: "R01-P01-N01-A01 → Staging",
      grupoOperacional: "Equipe Picking",
      status: "concluido",
      detalhes: "PED-10001 – 5 unidades separadas",
    },
    {
      id: 5,
      tipo: "Expedição",
      descricao: "Volume expedido ao cliente",
      usuario: "Eduardo Neves",
      dataHora: "2024-01-22 09:30:00",
      localizacao: "Doca 01 – Expedição",
      grupoOperacional: "Equipe Expedição",
      status: "em_andamento",
      detalhes: "Veículo ABC-1234 – Rota SP-01",
    },
  ],
};
