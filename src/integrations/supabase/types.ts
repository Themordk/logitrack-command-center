export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agrupamento_separacao: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          sequencia: number | null
          tenant_id: string | null
          tipo_agrupamento:
            | Database["public"]["Enums"]["enum_agrupar_sep_por"]
            | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          sequencia?: number | null
          tenant_id?: string | null
          tipo_agrupamento?:
            | Database["public"]["Enums"]["enum_agrupar_sep_por"]
            | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          sequencia?: number | null
          tenant_id?: string | null
          tipo_agrupamento?:
            | Database["public"]["Enums"]["enum_agrupar_sep_por"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "agrupamento_separacao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupamento_separacao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      armazem: {
        Row: {
          ativo: boolean
          capacidade: number | null
          cidade: string | null
          codigo_erp: string
          descricao: string
          empresa_id: string
          id: string
          tenant_id: string
          uf: string | null
        }
        Insert: {
          ativo?: boolean
          capacidade?: number | null
          cidade?: string | null
          codigo_erp: string
          descricao: string
          empresa_id: string
          id?: string
          tenant_id: string
          uf?: string | null
        }
        Update: {
          ativo?: boolean
          capacidade?: number | null
          cidade?: string | null
          codigo_erp?: string
          descricao?: string
          empresa_id?: string
          id?: string
          tenant_id?: string
          uf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "armazem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      box: {
        Row: {
          armazem_id: string
          ativo: boolean
          descricao: string
          id: string
          tenant_id: string
          tipo_box_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id: string
          tipo_box_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string
          tipo_box_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_tipo_box_id_fkey"
            columns: ["tipo_box_id"]
            isOneToOne: false
            referencedRelation: "tipo_box"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_entrada: {
        Row: {
          armazem_id: string | null
          created_at: string | null
          data_emissao: string
          data_entrada: string
          empresa_id: string
          id: string
          numero_nota: string
          parceiro_id: string
          qtd_volume: number | null
          status: number
          tenant_id: string
          tipo_entrada_id: string
          valor_total_nota: number
          valor_total_produtos: number
        }
        Insert: {
          armazem_id?: string | null
          created_at?: string | null
          data_emissao: string
          data_entrada: string
          empresa_id: string
          id?: string
          numero_nota: string
          parceiro_id: string
          qtd_volume?: number | null
          status: number
          tenant_id: string
          tipo_entrada_id: string
          valor_total_nota: number
          valor_total_produtos: number
        }
        Update: {
          armazem_id?: string | null
          created_at?: string | null
          data_emissao?: string
          data_entrada?: string
          empresa_id?: string
          id?: string
          numero_nota?: string
          parceiro_id?: string
          qtd_volume?: number | null
          status?: number
          tenant_id?: string
          tipo_entrada_id?: string
          valor_total_nota?: number
          valor_total_produtos?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_entrada_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_tipo_entrada_id_fkey"
            columns: ["tipo_entrada_id"]
            isOneToOne: false
            referencedRelation: "tipo_entrada"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_entrada_item: {
        Row: {
          documento_entrada_id: string
          id: string
          produto_id: string
          quantidade: number
          tenant_id: string
          valor_total: number
          valor_unidade: number
        }
        Insert: {
          documento_entrada_id: string
          id?: string
          produto_id: string
          quantidade: number
          tenant_id: string
          valor_total: number
          valor_unidade: number
        }
        Update: {
          documento_entrada_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
          tenant_id?: string
          valor_total?: number
          valor_unidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "documento_entrada_item_documento_entrada_id_fkey"
            columns: ["documento_entrada_id"]
            isOneToOne: false
            referencedRelation: "documento_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_entrada_item_lote: {
        Row: {
          documento_entrada_item_id: string
          fabricacao: string
          id: string
          lote: string
          quantidade: number
          serie: string | null
          tenant_id: string
          validade: string
        }
        Insert: {
          documento_entrada_item_id: string
          fabricacao: string
          id?: string
          lote: string
          quantidade: number
          serie?: string | null
          tenant_id: string
          validade: string
        }
        Update: {
          documento_entrada_item_id?: string
          fabricacao?: string
          id?: string
          lote?: string
          quantidade?: number
          serie?: string | null
          tenant_id?: string
          validade?: string
        }
        Relationships: [
          {
            foreignKeyName: "documento_entrada_item_lote_documento_entrada_item_id_fkey"
            columns: ["documento_entrada_item_id"]
            isOneToOne: false
            referencedRelation: "documento_entrada_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_item_lote_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_saida: {
        Row: {
          data_emissao: string
          empresa_id: string
          id: string
          numero_pedido: number
          observacao: string | null
          parceiro_id: string
          rota_id: string | null
          status: number
          tenant_id: string
          tipo_pedido_id: string
          transportador: string | null
          valor_pedido: number
          vendedor: string | null
        }
        Insert: {
          data_emissao: string
          empresa_id: string
          id?: string
          numero_pedido: number
          observacao?: string | null
          parceiro_id: string
          rota_id?: string | null
          status: number
          tenant_id: string
          tipo_pedido_id: string
          transportador?: string | null
          valor_pedido: number
          vendedor?: string | null
        }
        Update: {
          data_emissao?: string
          empresa_id?: string
          id?: string
          numero_pedido?: number
          observacao?: string | null
          parceiro_id?: string
          rota_id?: string | null
          status?: number
          tenant_id?: string
          tipo_pedido_id?: string
          transportador?: string | null
          valor_pedido?: number
          vendedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_doc_saida_empresa"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_parceiro"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_rota"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_tipo"
            columns: ["tipo_pedido_id"]
            isOneToOne: false
            referencedRelation: "tipo_saida"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_saida_item: {
        Row: {
          documento_saida_id: string
          id: string
          produto_id: string
          quantidade: number
          tenant_id: string
          valor_total: number
          valor_unit: number
        }
        Insert: {
          documento_saida_id: string
          id?: string
          produto_id: string
          quantidade: number
          tenant_id: string
          valor_total: number
          valor_unit: number
        }
        Update: {
          documento_saida_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
          tenant_id?: string
          valor_total?: number
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_doc_saida_item_doc"
            columns: ["documento_saida_id"]
            isOneToOne: false
            referencedRelation: "documento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_item_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_saida_item_lote: {
        Row: {
          documento_saida_item_id: string
          fabricacao: string
          id: string
          lote: string
          quantidade: number
          serie: string
          tenant_id: string
          validade: string
        }
        Insert: {
          documento_saida_item_id: string
          fabricacao: string
          id?: string
          lote: string
          quantidade: number
          serie: string
          tenant_id: string
          validade: string
        }
        Update: {
          documento_saida_item_id?: string
          fabricacao?: string
          id?: string
          lote?: string
          quantidade?: number
          serie?: string
          tenant_id?: string
          validade?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_doc_saida_item_lote"
            columns: ["documento_saida_item_id"]
            isOneToOne: false
            referencedRelation: "documento_saida_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_item_lote_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa: {
        Row: {
          ativo: boolean
          cnpj: string
          id: string
          razaosocial: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          cnpj: string
          id?: string
          razaosocial: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          id?: string
          razaosocial?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      endereco: {
        Row: {
          altura: number | null
          apto: number
          armazem_id: string
          ativo: boolean
          codigo_endereco: number | null
          comprimento: number | null
          curva_acesso: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string
          id: string
          lado: Database["public"]["Enums"]["enum_lado"]
          largura: number | null
          m3: number | null
          nivel: number
          peso_total: number | null
          predio: number
          rua: number
          setor_id: string
          situacao: Database["public"]["Enums"]["enum_situacao_endereco"]
          tenant_id: string
          tipo_endereco: Database["public"]["Enums"]["enum_tipo_endereco"]
          tipo_estoque_id: string
          tipo_estrutura:
            | Database["public"]["Enums"]["tipo_estrutura_armazem"]
            | null
          total_pallet: number | null
        }
        Insert: {
          altura?: number | null
          apto: number
          armazem_id: string
          ativo?: boolean
          codigo_endereco?: number | null
          comprimento?: number | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string
          id?: string
          lado: Database["public"]["Enums"]["enum_lado"]
          largura?: number | null
          m3?: number | null
          nivel: number
          peso_total?: number | null
          predio: number
          rua: number
          setor_id: string
          situacao: Database["public"]["Enums"]["enum_situacao_endereco"]
          tenant_id: string
          tipo_endereco: Database["public"]["Enums"]["enum_tipo_endereco"]
          tipo_estoque_id: string
          tipo_estrutura?:
            | Database["public"]["Enums"]["tipo_estrutura_armazem"]
            | null
          total_pallet?: number | null
        }
        Update: {
          altura?: number | null
          apto?: number
          armazem_id?: string
          ativo?: boolean
          codigo_endereco?: number | null
          comprimento?: number | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          descricao?: string
          id?: string
          lado?: Database["public"]["Enums"]["enum_lado"]
          largura?: number | null
          m3?: number | null
          nivel?: number
          peso_total?: number | null
          predio?: number
          rua?: number
          setor_id?: string
          situacao?: Database["public"]["Enums"]["enum_situacao_endereco"]
          tenant_id?: string
          tipo_endereco?: Database["public"]["Enums"]["enum_tipo_endereco"]
          tipo_estoque_id?: string
          tipo_estrutura?:
            | Database["public"]["Enums"]["tipo_estrutura_armazem"]
            | null
          total_pallet?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "endereco_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endereco_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      endereco_zona_atividade: {
        Row: {
          endereco_id: string
          id: string
          tenant_id: string
          zona_atividade_id: string
        }
        Insert: {
          endereco_id: string
          id?: string
          tenant_id: string
          zona_atividade_id: string
        }
        Update: {
          endereco_id?: string
          id?: string
          tenant_id?: string
          zona_atividade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "endereco_zona_atividade_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endereco_zona_atividade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "endereco_zona_atividade_zona_atividade_id_fkey"
            columns: ["zona_atividade_id"]
            isOneToOne: false
            referencedRelation: "zona_atividade"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_geral: {
        Row: {
          atualizado_em: string | null
          data_fabricacao: string
          data_validade: string
          empresa_id: string
          endereco_id: string | null
          hu_id: string
          id: string
          lote: string
          numero_serie: string | null
          produto_id: string
          quantidade_bloqueada: number
          quantidade_disponivel: number
          quantidade_total: number
          tenant_id: string
        }
        Insert: {
          atualizado_em?: string | null
          data_fabricacao?: string
          data_validade?: string
          empresa_id: string
          endereco_id?: string | null
          hu_id?: string
          id?: string
          lote?: string
          numero_serie?: string | null
          produto_id: string
          quantidade_bloqueada?: number
          quantidade_disponivel?: number
          quantidade_total?: number
          tenant_id: string
        }
        Update: {
          atualizado_em?: string | null
          data_fabricacao?: string
          data_validade?: string
          empresa_id?: string
          endereco_id?: string | null
          hu_id?: string
          id?: string
          lote?: string
          numero_serie?: string | null
          produto_id?: string
          quantidade_bloqueada?: number
          quantidade_disponivel?: number
          quantidade_total?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_geral_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_geral_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_geral_hu_id_fkey"
            columns: ["hu_id"]
            isOneToOne: false
            referencedRelation: "hu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_geral_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_movimento: {
        Row: {
          criado_em: string | null
          data_fabricacao: string | null
          data_validade: string | null
          documento_origem_id: string | null
          empresa_id: string
          endereco_destino_id: string | null
          endereco_origem_id: string | null
          hu_id: string | null
          id: string
          lote: string | null
          numero_serie: string | null
          produto_id: string
          quantidade: number
          tarefa_execucao_id: string | null
          tenant_id: string
          tipo_movimento: number
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string | null
          data_fabricacao?: string | null
          data_validade?: string | null
          documento_origem_id?: string | null
          empresa_id: string
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          hu_id?: string | null
          id?: string
          lote?: string | null
          numero_serie?: string | null
          produto_id: string
          quantidade: number
          tarefa_execucao_id?: string | null
          tenant_id: string
          tipo_movimento: number
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string | null
          data_fabricacao?: string | null
          data_validade?: string | null
          documento_origem_id?: string | null
          empresa_id?: string
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          hu_id?: string | null
          id?: string
          lote?: string | null
          numero_serie?: string | null
          produto_id?: string
          quantidade?: number
          tarefa_execucao_id?: string | null
          tenant_id?: string
          tipo_movimento?: number
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estoque_movimento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_endereco_destino_id_fkey"
            columns: ["endereco_destino_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_hu_id_fkey"
            columns: ["hu_id"]
            isOneToOne: false
            referencedRelation: "hu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "tarefa_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "estoque_movimento_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "estoque_movimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      grupo_produto: {
        Row: {
          ativo: boolean
          codigo_erp: string | null
          descricao: string
          empresa_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          codigo_erp?: string | null
          descricao: string
          empresa_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          codigo_erp?: string | null
          descricao?: string
          empresa_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupo_produto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grupo_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      hu: {
        Row: {
          altura: number | null
          codigo_hu: string | null
          disponibilidade:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          empresa_id: string | null
          id: string
          m3: number | null
          peso_bruto: number | null
          tamanho: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id: string
          tipo_hu: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Insert: {
          altura?: number | null
          codigo_hu?: string | null
          disponibilidade?:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          empresa_id?: string | null
          id?: string
          m3?: number | null
          peso_bruto?: number | null
          tamanho?: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id: string
          tipo_hu?: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Update: {
          altura?: number | null
          codigo_hu?: string | null
          disponibilidade?:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          empresa_id?: string | null
          id?: string
          m3?: number | null
          peso_bruto?: number | null
          tamanho?: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id?: string
          tipo_hu?: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Relationships: [
          {
            foreignKeyName: "hu_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hu_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_config: {
        Row: {
          armazem_id: string
          banco: string
          created_at: string
          host: string
          id: string
          senha_criptografada: string
          tenant_id: string
          tipo_banco: string
          updated_at: string
          usuario_bd: string
        }
        Insert: {
          armazem_id: string
          banco: string
          created_at?: string
          host: string
          id?: string
          senha_criptografada: string
          tenant_id: string
          tipo_banco: string
          updated_at?: string
          usuario_bd: string
        }
        Update: {
          armazem_id?: string
          banco?: string
          created_at?: string
          host?: string
          id?: string
          senha_criptografada?: string
          tenant_id?: string
          tipo_banco?: string
          updated_at?: string
          usuario_bd?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_config_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      integracao_objetos: {
        Row: {
          armazem_id: string
          campo_atualizacao: string | null
          campo_chave: string | null
          created_at: string
          id: string
          objeto_sistema: string
          tabela_erp: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          armazem_id: string
          campo_atualizacao?: string | null
          campo_chave?: string | null
          created_at?: string
          id?: string
          objeto_sistema: string
          tabela_erp?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          armazem_id?: string
          campo_atualizacao?: string | null
          campo_chave?: string | null
          created_at?: string
          id?: string
          objeto_sistema?: string
          tabela_erp?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integracao_objetos_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integracao_objetos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          created_at: string
          criado_por: string | null
          descricao: string | null
          empresa_id: string
          fim_em: string | null
          id: number
          inicio_em: string | null
          status: Database["public"]["Enums"]["enum_status_tarefa"] | null
          tenant_id: string
          tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
        }
        Insert: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id: string
          fim_em?: string | null
          id?: number
          inicio_em?: string | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"] | null
          tenant_id: string
          tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
        }
        Update: {
          created_at?: string
          criado_por?: string | null
          descricao?: string | null
          empresa_id?: string
          fim_em?: string | null
          id?: number
          inicio_em?: string | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"] | null
          tenant_id?: string
          tipo_inventario?: Database["public"]["Enums"]["enum_tipo_inventario"]
        }
        Relationships: [
          {
            foreignKeyName: "inventario_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      log_sessao_usuario: {
        Row: {
          fim_sessao: string | null
          id: string
          inicio_sessao: string
          tenant_id: string
          ultimo_heartbeat: string
          usuario_id: string
        }
        Insert: {
          fim_sessao?: string | null
          id?: string
          inicio_sessao?: string
          tenant_id: string
          ultimo_heartbeat?: string
          usuario_id: string
        }
        Update: {
          fim_sessao?: string | null
          id?: string
          inicio_sessao?: string
          tenant_id?: string
          ultimo_heartbeat?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_sessao_usuario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_sessao_usuario_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      motivo_ocorrencia: {
        Row: {
          armazem_id: string
          ativo: boolean
          bloqueio_estoque: boolean
          descricao: string
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id: string
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          bloqueio_estoque?: boolean
          descricao: string
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id?: string
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          bloqueio_estoque?: boolean
          descricao?: string
          etapa_ocorrencia?: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motivo_ocorrencia_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivo_ocorrencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_entrada: {
        Row: {
          armazem_id: string
          autorizado_em: string | null
          box_id: string
          conferencia_finalizada_em: string | null
          conferencia_finalizada_por: string | null
          conferencia_iniciada_em: string | null
          conferencia_iniciada_por: string | null
          confirma_volume: boolean
          created_at: string | null
          created_by: string | null
          crossdocking: boolean
          empresa_id: string | null
          finalizado_em: string | null
          id: string
          motivo_ocorrencia: string | null
          numero_movimento: number | null
          observacao: string | null
          placa_veiculo: string | null
          status: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          tenant_id: string
          total_volume: number | null
          total_volume_conferido: number | null
          usuario_autorizou: string | null
          valor_descarga: number | null
        }
        Insert: {
          armazem_id: string
          autorizado_em?: string | null
          box_id: string
          conferencia_finalizada_em?: string | null
          conferencia_finalizada_por?: string | null
          conferencia_iniciada_em?: string | null
          conferencia_iniciada_por?: string | null
          confirma_volume?: boolean
          created_at?: string | null
          created_by?: string | null
          crossdocking?: boolean
          empresa_id?: string | null
          finalizado_em?: string | null
          id?: string
          motivo_ocorrencia?: string | null
          numero_movimento?: number | null
          observacao?: string | null
          placa_veiculo?: string | null
          status?: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          tenant_id: string
          total_volume?: number | null
          total_volume_conferido?: number | null
          usuario_autorizou?: string | null
          valor_descarga?: number | null
        }
        Update: {
          armazem_id?: string
          autorizado_em?: string | null
          box_id?: string
          conferencia_finalizada_em?: string | null
          conferencia_finalizada_por?: string | null
          conferencia_iniciada_em?: string | null
          conferencia_iniciada_por?: string | null
          confirma_volume?: boolean
          created_at?: string | null
          created_by?: string | null
          crossdocking?: boolean
          empresa_id?: string | null
          finalizado_em?: string | null
          id?: string
          motivo_ocorrencia?: string | null
          numero_movimento?: number | null
          observacao?: string | null
          placa_veiculo?: string | null
          status?: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          tenant_id?: string
          total_volume?: number | null
          total_volume_conferido?: number | null
          usuario_autorizou?: string | null
          valor_descarga?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "box"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_conferencia_finalizada_por_fkey"
            columns: ["conferencia_finalizada_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_conferencia_iniciada_por_fkey"
            columns: ["conferencia_iniciada_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_motivo_ocorrencia_fkey"
            columns: ["motivo_ocorrencia"]
            isOneToOne: false
            referencedRelation: "motivo_ocorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_usuario_autorizou_fkey"
            columns: ["usuario_autorizou"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_entrada_documento: {
        Row: {
          documento_entrada_id: string
          id: string
          movimento_entrada_id: string
          tenant_id: string
        }
        Insert: {
          documento_entrada_id: string
          id?: string
          movimento_entrada_id: string
          tenant_id: string
        }
        Update: {
          documento_entrada_id?: string
          id?: string
          movimento_entrada_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_documento_documento_entrada_id_fkey"
            columns: ["documento_entrada_id"]
            isOneToOne: false
            referencedRelation: "documento_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "movimento_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "v_recebimento_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_entrada_item: {
        Row: {
          id: string
          movimento_entrada_id: string
          produto_id: string
          qtd_armazenada: number | null
          qtd_conferida: number
          qtd_esperada: number
          qtd_ocorrencia: number | null
          status_item_movimento: Database["public"]["Enums"]["enum_status_item_movimento"]
          tenant_id: string
        }
        Insert: {
          id?: string
          movimento_entrada_id: string
          produto_id: string
          qtd_armazenada?: number | null
          qtd_conferida?: number
          qtd_esperada: number
          qtd_ocorrencia?: number | null
          status_item_movimento?: Database["public"]["Enums"]["enum_status_item_movimento"]
          tenant_id: string
        }
        Update: {
          id?: string
          movimento_entrada_id?: string
          produto_id?: string
          qtd_armazenada?: number | null
          qtd_conferida?: number
          qtd_esperada?: number
          qtd_ocorrencia?: number | null
          status_item_movimento?: Database["public"]["Enums"]["enum_status_item_movimento"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "movimento_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "v_recebimento_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_saida: {
        Row: {
          box_id: string | null
          chave_agrupamento: string
          data_emissao: string
          destino_carga: string | null
          empresa_id: string
          id: string
          m3: number | null
          motorista: string | null
          numero_onda: number
          observacao: string | null
          peso_total: number | null
          prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          rota_id: string | null
          status: Database["public"]["Enums"]["enum_status_onda_carregamento"]
          tenant_id: string
          total_pedidos: number | null
          total_volume: number | null
          veiculo_id: string | null
        }
        Insert: {
          box_id?: string | null
          chave_agrupamento: string
          data_emissao: string
          destino_carga?: string | null
          empresa_id: string
          id?: string
          m3?: number | null
          motorista?: string | null
          numero_onda?: number
          observacao?: string | null
          peso_total?: number | null
          prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          rota_id?: string | null
          status: Database["public"]["Enums"]["enum_status_onda_carregamento"]
          tenant_id: string
          total_pedidos?: number | null
          total_volume?: number | null
          veiculo_id?: string | null
        }
        Update: {
          box_id?: string | null
          chave_agrupamento?: string
          data_emissao?: string
          destino_carga?: string | null
          empresa_id?: string
          id?: string
          m3?: number | null
          motorista?: string | null
          numero_onda?: number
          observacao?: string | null
          peso_total?: number | null
          prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          rota_id?: string | null
          status?: Database["public"]["Enums"]["enum_status_onda_carregamento"]
          tenant_id?: string
          total_pedidos?: number | null
          total_volume?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_onda_box"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "box"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_empresa"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_rota"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_veiculo"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
        ]
      }
      movimento_saida_documento: {
        Row: {
          documento_saida_id: string
          id: string
          movimento_saida_id: string
          ordem: number
          tenant_id: string
        }
        Insert: {
          documento_saida_id: string
          id?: string
          movimento_saida_id: string
          ordem: number
          tenant_id: string
        }
        Update: {
          documento_saida_id?: string
          id?: string
          movimento_saida_id?: string
          ordem?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_onda_doc_doc"
            columns: ["documento_saida_id"]
            isOneToOne: false
            referencedRelation: "documento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_doc_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_doc_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_doc_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "fk_onda_doc_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "fk_onda_doc_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_documento_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_documento_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_documento_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_saida_documento_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
        ]
      }
      movimento_saida_item: {
        Row: {
          autorizado_em: string | null
          id: string
          motivo_ocorrencia: string | null
          movimento_saida_id: string
          produto_id: string
          qtd_esperada: number
          qtd_separada: number | null
          qtde_cortada: number | null
          status: Database["public"]["Enums"]["enum_status_item_onda"] | null
          tenant_id: string
          usuario_autorizou: string | null
          valor_total: number
          valor_unit: number
        }
        Insert: {
          autorizado_em?: string | null
          id?: string
          motivo_ocorrencia?: string | null
          movimento_saida_id: string
          produto_id: string
          qtd_esperada: number
          qtd_separada?: number | null
          qtde_cortada?: number | null
          status?: Database["public"]["Enums"]["enum_status_item_onda"] | null
          tenant_id: string
          usuario_autorizou?: string | null
          valor_total: number
          valor_unit: number
        }
        Update: {
          autorizado_em?: string | null
          id?: string
          motivo_ocorrencia?: string | null
          movimento_saida_id?: string
          produto_id?: string
          qtd_esperada?: number
          qtd_separada?: number | null
          qtde_cortada?: number | null
          status?: Database["public"]["Enums"]["enum_status_item_onda"] | null
          tenant_id?: string
          usuario_autorizou?: string | null
          valor_total?: number
          valor_unit?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "fk_onda_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_motivo_ocorrencia_fkey"
            columns: ["motivo_ocorrencia"]
            isOneToOne: false
            referencedRelation: "motivo_ocorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_saida_item_usuario_autorizou_fkey"
            columns: ["usuario_autorizou"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ordem_expedicao: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          ordem: string | null
          rua: number | null
          sequencia: number | null
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          ordem?: string | null
          rua?: number | null
          sequencia?: number | null
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          ordem?: string | null
          rua?: number | null
          sequencia?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ordem_expedixao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordem_expedixao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiro: {
        Row: {
          ativo: boolean
          bairro: string
          cidade: string
          cnpj: string
          codigo_erp: string | null
          dias_shelf: number | null
          empresa_id: string
          endereco: string
          estado: string
          id: string
          razaosocial: string
          rota_id: string | null
          tenant_id: string
          tipo_parceiro: Database["public"]["Enums"]["enum_tipo_parceiro"]
        }
        Insert: {
          ativo?: boolean
          bairro: string
          cidade: string
          cnpj: string
          codigo_erp?: string | null
          dias_shelf?: number | null
          empresa_id: string
          endereco: string
          estado: string
          id?: string
          razaosocial: string
          rota_id?: string | null
          tenant_id: string
          tipo_parceiro: Database["public"]["Enums"]["enum_tipo_parceiro"]
        }
        Update: {
          ativo?: boolean
          bairro?: string
          cidade?: string
          cnpj?: string
          codigo_erp?: string | null
          dias_shelf?: number | null
          empresa_id?: string
          endereco?: string
          estado?: string
          id?: string
          razaosocial?: string
          rota_id?: string | null
          tenant_id?: string
          tipo_parceiro?: Database["public"]["Enums"]["enum_tipo_parceiro"]
        }
        Relationships: [
          {
            foreignKeyName: "parceiro_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_rota_id_fkey"
            columns: ["rota_id"]
            isOneToOne: false
            referencedRelation: "rotas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parceiro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_produto: {
        Row: {
          armazem_id: string
          ativo: boolean
          endereco_id: string
          est_maximo: number
          est_minimo: number
          id: string
          produto_id: string
          tenant_id: string
          tipo_picking: Database["public"]["Enums"]["enum_tipo_picking"]
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          endereco_id: string
          est_maximo: number
          est_minimo: number
          id?: string
          produto_id: string
          tenant_id: string
          tipo_picking: Database["public"]["Enums"]["enum_tipo_picking"]
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          endereco_id?: string
          est_maximo?: number
          est_minimo?: number
          id?: string
          produto_id?: string
          tenant_id?: string
          tipo_picking?: Database["public"]["Enums"]["enum_tipo_picking"]
        }
        Relationships: [
          {
            foreignKeyName: "picking_produto_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_produto_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      produto: {
        Row: {
          ativo: boolean
          camada: number | null
          curva_acesso: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string
          dias_shelf: number | null
          empresa_id: string
          fator_caixa: number | null
          foto: string | null
          grupo_id: string | null
          id: string
          lastro: number | null
          marca: string | null
          parceiro_id: string
          peso_variavel: boolean
          preco_custo: number | null
          referencia: string
          shelf_devolucao: number | null
          shelf_entrada: number | null
          sku: string
          subgrupo_id: string | null
          tenant_id: string
          tipo_controle: Database["public"]["Enums"]["enum_tipo_controle"]
          tipo_separacao: Database["public"]["Enums"]["enum_tipo_separacao"]
          tolerancia: number | null
          usa_picking: boolean
          varios_pickings: boolean
        }
        Insert: {
          ativo?: boolean
          camada?: number | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda?: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string
          dias_shelf?: number | null
          empresa_id: string
          fator_caixa?: number | null
          foto?: string | null
          grupo_id?: string | null
          id?: string
          lastro?: number | null
          marca?: string | null
          parceiro_id: string
          peso_variavel?: boolean
          preco_custo?: number | null
          referencia: string
          shelf_devolucao?: number | null
          shelf_entrada?: number | null
          sku: string
          subgrupo_id?: string | null
          tenant_id: string
          tipo_controle: Database["public"]["Enums"]["enum_tipo_controle"]
          tipo_separacao: Database["public"]["Enums"]["enum_tipo_separacao"]
          tolerancia?: number | null
          usa_picking?: boolean
          varios_pickings?: boolean
        }
        Update: {
          ativo?: boolean
          camada?: number | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda?: Database["public"]["Enums"]["enum_curva"] | null
          descricao?: string
          dias_shelf?: number | null
          empresa_id?: string
          fator_caixa?: number | null
          foto?: string | null
          grupo_id?: string | null
          id?: string
          lastro?: number | null
          marca?: string | null
          parceiro_id?: string
          peso_variavel?: boolean
          preco_custo?: number | null
          referencia?: string
          shelf_devolucao?: number | null
          shelf_entrada?: number | null
          sku?: string
          subgrupo_id?: string | null
          tenant_id?: string
          tipo_controle?: Database["public"]["Enums"]["enum_tipo_controle"]
          tipo_separacao?: Database["public"]["Enums"]["enum_tipo_separacao"]
          tolerancia?: number | null
          usa_picking?: boolean
          varios_pickings?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "produto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupo_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_parceiro_id_fkey"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_subgrupo_id_fkey"
            columns: ["subgrupo_id"]
            isOneToOne: false
            referencedRelation: "subgrupo_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_embalagem: {
        Row: {
          altura: number | null
          ativo: boolean
          comprimento: number | null
          ean: string
          embalagem: string
          empresa_id: string
          fator: number
          id: string
          largura: number | null
          m3: number | null
          peso_bruto: number | null
          peso_liquido: number | null
          produto_id: string
          tenant_id: string
        }
        Insert: {
          altura?: number | null
          ativo?: boolean
          comprimento?: number | null
          ean: string
          embalagem: string
          empresa_id: string
          fator: number
          id?: string
          largura?: number | null
          m3?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          produto_id: string
          tenant_id: string
        }
        Update: {
          altura?: number | null
          ativo?: boolean
          comprimento?: number | null
          ean?: string
          embalagem?: string
          empresa_id?: string
          fator?: number
          id?: string
          largura?: number | null
          m3?: number | null
          peso_bruto?: number | null
          peso_liquido?: number | null
          produto_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_embalagem_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_embalagem_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_embalagem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          armazem_id: string
          ativo: boolean
          descricao: string
          id: string
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotas_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      sequencia: {
        Row: {
          created_at: string
          endereco: number | null
          hu: number | null
          id: number
          tenant_id: string | null
        }
        Insert: {
          created_at?: string
          endereco?: number | null
          hu?: number | null
          id?: number
          tenant_id?: string | null
        }
        Update: {
          created_at?: string
          endereco?: number | null
          hu?: number | null
          id?: number
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sequencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequencia_tenant_id_fkey1"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      setor: {
        Row: {
          armazem_id: string
          ativo: boolean
          descricao: string
          id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["enum_tipo_setor"] | null
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id: string
          tipo?: Database["public"]["Enums"]["enum_tipo_setor"] | null
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["enum_tipo_setor"] | null
        }
        Relationships: [
          {
            foreignKeyName: "setor_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      subgrupo_produto: {
        Row: {
          ativo: boolean
          codigo_erp: string | null
          descricao: string
          empresa_id: string
          grupo_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          codigo_erp?: string | null
          descricao: string
          empresa_id: string
          grupo_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          codigo_erp?: string | null
          descricao?: string
          empresa_id?: string
          grupo_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subgrupo_produto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subgrupo_produto_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupo_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subgrupo_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa: {
        Row: {
          armazem_id: string | null
          concluido_em: string | null
          criado_em: string
          empresa_id: string
          id: string
          id_documento_origem: string | null
          id_local_destino: string | null
          id_local_origem: string | null
          ordem_tarefa: number | null
          percentual_execucao: number | null
          prioridade: number
          produto_id: string | null
          quantidade_executada: number
          quantidade_requerida: number | null
          status: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id: string
          tipo_documento_origem: string | null
          tipo_tarefa_id: string
        }
        Insert: {
          armazem_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          empresa_id: string
          id?: string
          id_documento_origem?: string | null
          id_local_destino?: string | null
          id_local_origem?: string | null
          ordem_tarefa?: number | null
          percentual_execucao?: number | null
          prioridade?: number
          produto_id?: string | null
          quantidade_executada?: number
          quantidade_requerida?: number | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id: string
          tipo_documento_origem?: string | null
          tipo_tarefa_id: string
        }
        Update: {
          armazem_id?: string | null
          concluido_em?: string | null
          criado_em?: string
          empresa_id?: string
          id?: string
          id_documento_origem?: string | null
          id_local_destino?: string | null
          id_local_origem?: string | null
          ordem_tarefa?: number | null
          percentual_execucao?: number | null
          prioridade?: number
          produto_id?: string | null
          quantidade_executada?: number
          quantidade_requerida?: number | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id?: string
          tipo_documento_origem?: string | null
          tipo_tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefa_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_id_local_destino_fkey"
            columns: ["id_local_destino"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_id_local_origem_fkey"
            columns: ["id_local_origem"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tipo_tarefa_id_fkey"
            columns: ["tipo_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tipo_tarefa"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_atribuicao: {
        Row: {
          atribuido_em: string
          empresa_id: string
          id: string
          liberado_em: string | null
          observacao: string | null
          status: string
          tarefa_id: string
          tenant_id: string
          tipo_convocacao:
            | Database["public"]["Enums"]["enum_tipo_convocacao"]
            | null
          usuario_id: string
        }
        Insert: {
          atribuido_em?: string
          empresa_id: string
          id?: string
          liberado_em?: string | null
          observacao?: string | null
          status?: string
          tarefa_id: string
          tenant_id: string
          tipo_convocacao?:
            | Database["public"]["Enums"]["enum_tipo_convocacao"]
            | null
          usuario_id: string
        }
        Update: {
          atribuido_em?: string
          empresa_id?: string
          id?: string
          liberado_em?: string | null
          observacao?: string | null
          status?: string
          tarefa_id?: string
          tenant_id?: string
          tipo_convocacao?:
            | Database["public"]["Enums"]["enum_tipo_convocacao"]
            | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tarefa_atribuicao_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tarefa_atribuicao_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "fk_tarefa_atribuicao_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_id"]
          },
        ]
      }
      tarefa_evento_execucao: {
        Row: {
          carga_util: Json | null
          execucao_tarefa_id: string
          id: number
          tarefa_id: string | null
          tenant_id: string
          timestamp_evento: string
          tipo_evento: Database["public"]["Enums"]["enum_tipo_evento_execucao"]
        }
        Insert: {
          carga_util?: Json | null
          execucao_tarefa_id: string
          id?: number
          tarefa_id?: string | null
          tenant_id: string
          timestamp_evento?: string
          tipo_evento: Database["public"]["Enums"]["enum_tipo_evento_execucao"]
        }
        Update: {
          carga_util?: Json | null
          execucao_tarefa_id?: string
          id?: number
          tarefa_id?: string | null
          tenant_id?: string
          timestamp_evento?: string
          tipo_evento?: Database["public"]["Enums"]["enum_tipo_evento_execucao"]
        }
        Relationships: [
          {
            foreignKeyName: "evento_execucao_tarefa_execucao_tarefa_id_fkey"
            columns: ["execucao_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_execucao_tarefa_execucao_tarefa_id_fkey"
            columns: ["execucao_tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "evento_execucao_tarefa_execucao_tarefa_id_fkey"
            columns: ["execucao_tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "evento_execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_evento_execucao_tarefa_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_evento_execucao_tarefa_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "tarefa_evento_execucao_tarefa_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_id"]
          },
        ]
      }
      tarefa_execucao: {
        Row: {
          atribuido_em: string
          concluido_em: string | null
          endereco_destino_id: string | null
          endereco_origem_id: string | null
          fabricacao: string | null
          hu: string | null
          id: string
          iniciado_em: string | null
          lote: string | null
          motivo_ocorrencia: string | null
          quantidade_cortada: number | null
          quantidade_executada: number | null
          serie: string | null
          status: Database["public"]["Enums"]["enum_status_execucao_tarefa"]
          tarefa_id: string
          tenant_id: string
          usuario_corte: string | null
          usuario_id: string
          validade: string | null
        }
        Insert: {
          atribuido_em?: string
          concluido_em?: string | null
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          fabricacao?: string | null
          hu?: string | null
          id?: string
          iniciado_em?: string | null
          lote?: string | null
          motivo_ocorrencia?: string | null
          quantidade_cortada?: number | null
          quantidade_executada?: number | null
          serie?: string | null
          status?: Database["public"]["Enums"]["enum_status_execucao_tarefa"]
          tarefa_id: string
          tenant_id: string
          usuario_corte?: string | null
          usuario_id: string
          validade?: string | null
        }
        Update: {
          atribuido_em?: string
          concluido_em?: string | null
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          fabricacao?: string | null
          hu?: string | null
          id?: string
          iniciado_em?: string | null
          lote?: string | null
          motivo_ocorrencia?: string | null
          quantidade_cortada?: number | null
          quantidade_executada?: number | null
          serie?: string | null
          status?: Database["public"]["Enums"]["enum_status_execucao_tarefa"]
          tarefa_id?: string
          tenant_id?: string
          usuario_corte?: string | null
          usuario_id?: string
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucao_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "execucao_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_tarefa_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_endereco_destino_id_fkey"
            columns: ["endereco_destino_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_hu_fkey"
            columns: ["hu"]
            isOneToOne: false
            referencedRelation: "hu"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_motivo_ocorrencia_fkey"
            columns: ["motivo_ocorrencia"]
            isOneToOne: false
            referencedRelation: "motivo_ocorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_usuario_corte_fkey"
            columns: ["usuario_corte"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa_performance: {
        Row: {
          data_execucao: string
          empresa_id: string
          endereco_id: string | null
          id: string
          peso: number | null
          produto_id: string | null
          quantidade: number | null
          tarefa_id: string
          tempo_execucao_segundos: number | null
          tenant_id: string
          tipo_tarefa_id: string
          usuario_id: string
        }
        Insert: {
          data_execucao?: string
          empresa_id: string
          endereco_id?: string | null
          id?: string
          peso?: number | null
          produto_id?: string | null
          quantidade?: number | null
          tarefa_id: string
          tempo_execucao_segundos?: number | null
          tenant_id: string
          tipo_tarefa_id: string
          usuario_id: string
        }
        Update: {
          data_execucao?: string
          empresa_id?: string
          endereco_id?: string | null
          id?: string
          peso?: number | null
          produto_id?: string | null
          quantidade?: number | null
          tarefa_id?: string
          tempo_execucao_segundos?: number | null
          tenant_id?: string
          tipo_tarefa_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tarefa_performance_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tarefa_performance_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "fk_tarefa_performance_tarefa"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_id"]
          },
        ]
      }
      tenant: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      tipo_box: {
        Row: {
          armazem_id: string
          ativo: boolean
          descricao: string
          id: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["enum_tipo_box"]
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id: string
          tipo: Database["public"]["Enums"]["enum_tipo_box"]
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["enum_tipo_box"]
        }
        Relationships: [
          {
            foreignKeyName: "tipo_box_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_box_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_entrada: {
        Row: {
          ativo: boolean
          coderp: string | null
          descricao: string
          empresa_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          coderp?: string | null
          descricao: string
          empresa_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          coderp?: string | null
          descricao?: string
          empresa_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_entrada_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_estoque: {
        Row: {
          armazem_id: string
          ativo: boolean
          codigo_erp: string
          descricao: string
          id: string
          sigla: string | null
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          codigo_erp: string
          descricao: string
          id?: string
          sigla?: string | null
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          codigo_erp?: string
          descricao?: string
          id?: string
          sigla?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tipo_estoque_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_saida: {
        Row: {
          ativo: boolean
          caderp: string | null
          descricao: string
          empresa_id: string
          id: string
          realiza_conferencia: boolean
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          caderp?: string | null
          descricao: string
          empresa_id: string
          id?: string
          realiza_conferencia?: boolean
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          caderp?: string | null
          descricao?: string
          empresa_id?: string
          id?: string
          realiza_conferencia?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tipo_saida_empresa"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_tipo_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_tarefa: {
        Row: {
          bloqueia_estoque: boolean | null
          codigo: string
          descricao: string
          exige_conferencia: boolean | null
          gera_movimento_estoque: boolean | null
          id: string
          prioridade_padrao: number | null
          tempo_estimado_segundos: number | null
          tenant_id: string
          tipo_movimento: number | null
        }
        Insert: {
          bloqueia_estoque?: boolean | null
          codigo: string
          descricao: string
          exige_conferencia?: boolean | null
          gera_movimento_estoque?: boolean | null
          id?: string
          prioridade_padrao?: number | null
          tempo_estimado_segundos?: number | null
          tenant_id: string
          tipo_movimento?: number | null
        }
        Update: {
          bloqueia_estoque?: boolean | null
          codigo?: string
          descricao?: string
          exige_conferencia?: boolean | null
          gera_movimento_estoque?: boolean | null
          id?: string
          prioridade_padrao?: number | null
          tempo_estimado_segundos?: number | null
          tenant_id?: string
          tipo_movimento?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      turnos: {
        Row: {
          armazem_id: string
          ativo: boolean
          descricao: string
          hora_fim: string
          hora_inicio: string
          id: string
          tempo_intervalo: number
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          hora_fim: string
          hora_inicio: string
          id?: string
          tempo_intervalo: number
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          hora_fim?: string
          hora_inicio?: string
          id?: string
          tempo_intervalo?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turnos_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario: {
        Row: {
          armazem_id: string
          ativo: boolean
          cod_erp: string | null
          created_at: string
          email: string | null
          empresa_id: string
          habilidade: Database["public"]["Enums"]["enum_habilidade"]
          id: string
          login: string
          nome: string
          tenant_id: string
          tipo_operacao: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          cod_erp?: string | null
          created_at?: string
          email?: string | null
          empresa_id: string
          habilidade?: Database["public"]["Enums"]["enum_habilidade"]
          id: string
          login: string
          nome: string
          tenant_id: string
          tipo_operacao: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario?: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          cod_erp?: string | null
          created_at?: string
          email?: string | null
          empresa_id?: string
          habilidade?: Database["public"]["Enums"]["enum_habilidade"]
          id?: string
          login?: string
          nome?: string
          tenant_id?: string
          tipo_operacao?: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario?: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      v_reg: {
        Row: {
          empresa_id: string | null
          endereco_destino_id: string | null
          endereco_origem_id: string | null
          fabricacao: string | null
          gera_movimento_estoque: boolean | null
          hu: string | null
          id: string | null
          lote: string | null
          produto_id: string | null
          quantidade_executada: number | null
          tenant_id: string | null
          tipo_movimento: number | null
          usuario_id: string | null
          validade: string | null
        }
        Insert: {
          empresa_id?: string | null
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          fabricacao?: string | null
          gera_movimento_estoque?: boolean | null
          hu?: string | null
          id?: string | null
          lote?: string | null
          produto_id?: string | null
          quantidade_executada?: number | null
          tenant_id?: string | null
          tipo_movimento?: number | null
          usuario_id?: string | null
          validade?: string | null
        }
        Update: {
          empresa_id?: string | null
          endereco_destino_id?: string | null
          endereco_origem_id?: string | null
          fabricacao?: string | null
          gera_movimento_estoque?: boolean | null
          hu?: string | null
          id?: string | null
          lote?: string | null
          produto_id?: string | null
          quantidade_executada?: number | null
          tenant_id?: string | null
          tipo_movimento?: number | null
          usuario_id?: string | null
          validade?: string | null
        }
        Relationships: []
      }
      veiculos: {
        Row: {
          ano: number
          ativo: boolean
          descricao: string
          empresa_id: string
          id: string
          m3: number | null
          peso_total: number | null
          placa: string
          tenant_id: string
          tipo_veiculo: Database["public"]["Enums"]["enum_tipo_veiculo"]
          total_pallet: number | null
        }
        Insert: {
          ano: number
          ativo?: boolean
          descricao: string
          empresa_id: string
          id?: string
          m3?: number | null
          peso_total?: number | null
          placa: string
          tenant_id: string
          tipo_veiculo: Database["public"]["Enums"]["enum_tipo_veiculo"]
          total_pallet?: number | null
        }
        Update: {
          ano?: number
          ativo?: boolean
          descricao?: string
          empresa_id?: string
          id?: string
          m3?: number | null
          peso_total?: number | null
          placa?: string
          tenant_id?: string
          tipo_veiculo?: Database["public"]["Enums"]["enum_tipo_veiculo"]
          total_pallet?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_expedicao: {
        Row: {
          codigo_volume: string
          created_at: string
          empresa_id: string | null
          id: string
          m3: number | null
          movimento_saida_id: string
          peso_bruto: number | null
          status: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id: string
        }
        Insert: {
          codigo_volume: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          m3?: number | null
          movimento_saida_id: string
          peso_bruto?: number | null
          status?: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id: string
        }
        Update: {
          codigo_volume?: string
          created_at?: string
          empresa_id?: string | null
          id?: string
          m3?: number | null
          movimento_saida_id?: string
          peso_bruto?: number | null
          status?: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_expedicao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_expedicao_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_expedicao_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_expedicao_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "volume_expedicao_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "volume_expedicao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      zona_atividade: {
        Row: {
          armazem_id: string
          Ativo: boolean | null
          descricao: string
          id: string
          tenant_id: string
          tipo_grupo: Database["public"]["Enums"]["enum_tipo_grupo"]
        }
        Insert: {
          armazem_id: string
          Ativo?: boolean | null
          descricao: string
          id?: string
          tenant_id: string
          tipo_grupo: Database["public"]["Enums"]["enum_tipo_grupo"]
        }
        Update: {
          armazem_id?: string
          Ativo?: boolean | null
          descricao?: string
          id?: string
          tenant_id?: string
          tipo_grupo?: Database["public"]["Enums"]["enum_tipo_grupo"]
        }
        Relationships: [
          {
            foreignKeyName: "zona_atividade_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zona_atividade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_recebimento_iniciar: {
        Row: {
          box: string | null
          id: string | null
          numero_movimento: number | null
          parceiro: string | null
          status: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
        }
        Relationships: []
      }
      v_separacao_iniciar: {
        Row: {
          box: string | null
          id: string | null
          numero_onda: number | null
          parceiro: string | null
          status:
            | Database["public"]["Enums"]["enum_status_onda_carregamento"]
            | null
        }
        Relationships: []
      }
      vw_movimento_entrada_armazenagem_detalhe: {
        Row: {
          codigo_hu: string | null
          concluido_em: string | null
          descricao_sku: string | null
          empresa_id: string | null
          endereco: string | null
          fabricacao: string | null
          iniciado_em: string | null
          login: string | null
          lote: string | null
          movimento_entrada_id: string | null
          quantidade_executada: number | null
          sku: string | null
          tenant_id: string | null
          validade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "movimento_entrada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "v_recebimento_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "tarefa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimento_entrada_conferencia_detalhe: {
        Row: {
          codigo_hu: string | null
          concluido_em: string | null
          descricao: string | null
          fabricacao: string | null
          iniciado_em: string | null
          lote: string | null
          movimento_id: string | null
          operador: string | null
          quantidade_executada: number | null
          serie: string | null
          sku: string | null
          status:
            | Database["public"]["Enums"]["enum_status_execucao_tarefa"]
            | null
          tarefa_execucao_id: string | null
          tarefa_id: string | null
          tarefa_status:
            | Database["public"]["Enums"]["enum_status_tarefa"]
            | null
          validade: string | null
        }
        Relationships: []
      }
      vw_movimento_entrada_resumo: {
        Row: {
          descricao: string | null
          movimento_id: string | null
          movimento_item_id: string | null
          qtd_armazenada: number | null
          qtd_conferida: number | null
          qtd_esperada: number | null
          sku: string | null
          status_item_movimento:
            | Database["public"]["Enums"]["enum_status_item_movimento"]
            | null
        }
        Relationships: []
      }
      vw_movimento_saida_conferencia_detalhe: {
        Row: {
          codigo_hu: string | null
          concluido_em: string | null
          descricao_sku: string | null
          empresa_id: string | null
          endereco: string | null
          fabricacao: string | null
          iniciado_em: string | null
          login: string | null
          lote: string | null
          movimento_saida_id: string | null
          quantidade_executada: number | null
          sku: string | null
          tenant_id: string | null
          validade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "fk_onda_item_onda"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "movimento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "v_separacao_iniciar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_resumo"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_saida_item_movimento_saida_id_fkey"
            columns: ["movimento_saida_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "tarefa_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimento_saida_resumo: {
        Row: {
          descricao: string | null
          movimento_id: string | null
          movimento_item_id: string | null
          qtd_conferida: number | null
          qtd_esperada: number | null
          qtd_separada: number | null
          sku: string | null
        }
        Relationships: []
      }
      vw_movimento_saida_separacao_detalhe: {
        Row: {
          codigo_hu: string | null
          concluido_em: string | null
          descricao: string | null
          fabricacao: string | null
          iniciado_em: string | null
          lote: string | null
          movimento_id: string | null
          operador: string | null
          quantidade_executada: number | null
          serie: string | null
          sku: string | null
          status:
            | Database["public"]["Enums"]["enum_status_execucao_tarefa"]
            | null
          tarefa_execucao_id: string | null
          tarefa_id: string | null
          tarefa_status:
            | Database["public"]["Enums"]["enum_status_tarefa"]
            | null
          validade: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cortar_item_separacao: {
        Args: {
          p_motivo_ocorrencia: string
          p_tarefa_id: string
          p_usuario: string
        }
        Returns: Json
      }
      finalizar_armazenagem: {
        Args: {
          p_endereco_destino_id: string
          p_fabricacao: string
          p_hu: string
          p_lote: string
          p_movimento_entrada_id: string
          p_quantidade: number
          p_tarefa_id: string
          p_usuario: string
          p_validade: string
        }
        Returns: string
      }
      finalizar_conferencia_entrada: {
        Args: { p_movimento_entrada_id: string; p_usuario: string }
        Returns: string
      }
      fn_usuario_tem_empresa: {
        Args: { p_empresa_id: string }
        Returns: boolean
      }
      fn_usuario_tenant: { Args: never; Returns: string }
      gerar_onda_separacao: {
        Args: {
          p_box_id: string
          p_documentos: string[]
          p_empresa_id: string
          p_prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          p_rota_id: string
          p_tenant_id: string
          p_veiculo_id: string
        }
        Returns: string
      }
      gerar_tarefas_armazenagem_c_divergencia: {
        Args: {
          p_motivo_ocorrencia: string
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario: string
        }
        Returns: string
      }
      gerar_tarefas_armazenagem_s_divergencia: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: string
      }
      gerar_tarefas_conferencia_entrada: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: string
      }
      get_current_tenant: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      hu_padrao: { Args: never; Returns: string }
      liberar_onda_separacao: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      processar_movimento_estoque: {
        Args: { p_tarefa_execucao_id: string }
        Returns: undefined
      }
      rpc_coletor_armazenagem_buscar_tarefa: {
        Args: {
          p_codigo_scan: string
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: {
          produto_descricao: string
          produto_id: string
          quantidade_armazenada: number
          quantidade_requerida: number
          quantidade_restante: number
          tarefa_id: string
        }[]
      }
      rpc_coletor_armazenagem_dashboard: {
        Args: { p_empresa_id: string; p_tenant_id: string }
        Returns: {
          documentos_pendentes: number
          percentual_concluido: number
          produtos_pendentes: number
          total_a_armazenar: number
          total_armazenado: number
        }[]
      }
      rpc_coletor_armazenagem_execucao: {
        Args: {
          p_empresa_id: string
          p_produto_id: string
          p_tenant_id: string
        }
        Returns: {
          estoque_picking: number
          estoque_pulmao: number
          total_a_armazenar: number
          total_armazenado: number
        }[]
      }
      separacao_buscar_ondas: {
        Args: {
          p_empresa_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: {
          movimento_saida_id: string
          numero_onda: number
          pedidos: string
          prioridade: string
          status: string
          tipo_venda: string
        }[]
      }
      separacao_buscar_tarefas: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: {
          armazem: string
          endereco: string
          fator_caixa: number
          ordem_tarefa: number
          produto: string
          quantidade_requerida: number
          separado: number
          setor: string
          sku: string
          status: string
          tarefa_id: string
        }[]
      }
      separacao_confirmar_endereco: {
        Args: { p_endereco_lido: string; p_tarefa_id: string }
        Returns: Json
      }
      separacao_executar_coleta: {
        Args: {
          p_endereco_id: string
          p_quantidade: number
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: string
      }
    }
    Enums: {
      enum_agrupar_sep_por:
        | "DOCUMENTO"
        | "PRODUTO"
        | "PARCEIRO"
        | "ROTA"
        | "ZONA_ATIVIDADE"
        | "TIPO_POSICAO"
        | "TIPO_SEP_SKU"
        | "CAPACDADE_HU"
        | "QUANTIDADE_MAX_SKU"
      enum_curva: "A" | "B" | "C" | "D"
      enum_disponibilidade_hu:
        | "DISPONIVEL"
        | "RESERVADA"
        | "BLOQUEADA"
        | "EM_MOVIMENTO"
        | "DESCARTADA"
      enum_etapa_ocorrencia:
        | "RECEBIMENTO"
        | "ARMAZENAGEM"
        | "ABASTECIMENTO"
        | "MOVIMENTACAO"
        | "SEPARACAO"
        | "EXPEDICAO"
      enum_habilidade: "TREINANDO" | "BASICO" | "BOM" | "ESPECIALISTA"
      enum_lado: "PAR" | "IMPAR"
      enum_prioridade_onda: "CRITICA" | "ALTA" | "NORMAL"
      enum_situacao_endereco: "LIVRE" | "OCUPADO" | "BLOQUEADO"
      enum_status_execucao_tarefa:
        | "ATRIBUIDA"
        | "EM_ANDAMENTO"
        | "PAUSADA"
        | "CONCLUIDA"
        | "CANCELADA"
      enum_status_item_movimento:
        | "PENDENTE"
        | "EM_ANDAMENTO"
        | "CONCLUIDO"
        | "CANCELADO"
        | "CONFERIDO"
        | "DIVERGENTE"
        | "ARMAZENADO"
      enum_status_item_onda:
        | "PENDENTE"
        | "EM_PICKING"
        | "SEPARADO"
        | "EM_CONFERENCIA"
        | "CONFERIDO"
        | "EMBARCADO"
        | "CANCELADO"
      enum_status_mov_entrada:
        | "GERADO"
        | "LIBERADO"
        | "ERRO_TRANSPORTADOR"
        | "EM_CONFERENCIA"
        | "CONFERIDO"
        | "DIVERGENCIA"
        | "LIB_ARMAZENAGEM"
        | "ARMAZENAGEM_PARCIAL"
        | "ARMAZENADO"
        | "EXPORTADO"
      enum_status_onda_carregamento:
        | "CRIADA"
        | "LIBERADO"
        | "EM_PICKING"
        | "SEPARADO"
        | "EM_CONFERENCIA"
        | "CONFERIDO"
        | "EM_CARREGAMENTO"
        | "CONCLUIDA"
        | "CANCELADA"
      enum_status_tarefa:
        | "CRIADA"
        | "ATRIBUIDA"
        | "EM_ANDAMENTO"
        | "PAUSADA"
        | "CONCLUIDA"
        | "CANCELADA"
      enum_status_volume: "ABERTO" | "FECHADO" | "CONFERIDO" | "EXPEDIDO"
      enum_tamanho_hu: "P" | "M" | "G" | "GG" | "EG"
      enum_tipo_box: "RECEBIMENTO" | "SEPARACAO" | "EXPEDICAO"
      enum_tipo_controle: "UNIDADE" | "LOTE" | "VALIDADE" | "SERIE" | "METROS"
      enum_tipo_convocacao:
        | "AUTO_CONVOCADO"
        | "CONVOCACAO_GESTOR"
        | "CONVOCACAO_ATIVA"
      enum_tipo_endereco: "PULMAO" | "PICKING"
      enum_tipo_evento_execucao:
        | "SCAN"
        | "PESAGEM"
        | "CONFIRMACAO_LOCAL"
        | "PAUSE"
        | "RESUME"
        | "ERRO"
        | "DIVERGENCIA"
        | "INICIO_EXECUCAO"
        | "FIM_EXECUCAO"
        | "ATRIBUICAO"
        | "SCAN_LOTE"
        | "CONFIRMACAO_LOTE"
      enum_tipo_grupo: "PICKING" | "ARMAZENAGEM" | "INVENTARIO"
      enum_tipo_hu: "PALLET" | "CAIXA" | "VOLUME" | "OUTRO"
      enum_tipo_inventario: "GERAL" | "CICLICO" | "AUDITORIA"
      enum_tipo_operacao:
        | "RECEBIMENTO"
        | "ARMAZENAGEM"
        | "MOVIMENTOS"
        | "SEPARACAO"
        | "CONFERENCIA"
        | "EXPEDICAO"
        | "AUDITORIA"
      enum_tipo_parceiro: "CLIENTE" | "FORNECEDOR" | "TRANSPORTADOR"
      enum_tipo_picking: "MASTER" | "FRACIONADO" | "PDV"
      enum_tipo_separacao: "FRACIONADO" | "EMBALAGEM_TOTAL" | "CAIXARIA"
      enum_tipo_setor:
        | "PICKING"
        | "PULMAO"
        | "RECEBIMENTO"
        | "QUARENTENA"
        | "EXPEDICAO"
      enum_tipo_usuario: "ADMINISTRADOR" | "GESTOR" | "OPERADOR"
      enum_tipo_veiculo:
        | "VUC"
        | "3/4"
        | "TOCO"
        | "TRUCK"
        | "BITRUCK"
        | "BITREM"
        | "RODOTREM"
        | "OUTROS"
      tipo_estrutura_armazem:
        | "PORTA PALLET"
        | "BLOCADO"
        | "PRATELEIRA"
        | "FLOW RACK"
        | "DRIVE IN"
        | "MEZANINO"
        | "DOCA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      enum_agrupar_sep_por: [
        "DOCUMENTO",
        "PRODUTO",
        "PARCEIRO",
        "ROTA",
        "ZONA_ATIVIDADE",
        "TIPO_POSICAO",
        "TIPO_SEP_SKU",
        "CAPACDADE_HU",
        "QUANTIDADE_MAX_SKU",
      ],
      enum_curva: ["A", "B", "C", "D"],
      enum_disponibilidade_hu: [
        "DISPONIVEL",
        "RESERVADA",
        "BLOQUEADA",
        "EM_MOVIMENTO",
        "DESCARTADA",
      ],
      enum_etapa_ocorrencia: [
        "RECEBIMENTO",
        "ARMAZENAGEM",
        "ABASTECIMENTO",
        "MOVIMENTACAO",
        "SEPARACAO",
        "EXPEDICAO",
      ],
      enum_habilidade: ["TREINANDO", "BASICO", "BOM", "ESPECIALISTA"],
      enum_lado: ["PAR", "IMPAR"],
      enum_prioridade_onda: ["CRITICA", "ALTA", "NORMAL"],
      enum_situacao_endereco: ["LIVRE", "OCUPADO", "BLOQUEADO"],
      enum_status_execucao_tarefa: [
        "ATRIBUIDA",
        "EM_ANDAMENTO",
        "PAUSADA",
        "CONCLUIDA",
        "CANCELADA",
      ],
      enum_status_item_movimento: [
        "PENDENTE",
        "EM_ANDAMENTO",
        "CONCLUIDO",
        "CANCELADO",
        "CONFERIDO",
        "DIVERGENTE",
        "ARMAZENADO",
      ],
      enum_status_item_onda: [
        "PENDENTE",
        "EM_PICKING",
        "SEPARADO",
        "EM_CONFERENCIA",
        "CONFERIDO",
        "EMBARCADO",
        "CANCELADO",
      ],
      enum_status_mov_entrada: [
        "GERADO",
        "LIBERADO",
        "ERRO_TRANSPORTADOR",
        "EM_CONFERENCIA",
        "CONFERIDO",
        "DIVERGENCIA",
        "LIB_ARMAZENAGEM",
        "ARMAZENAGEM_PARCIAL",
        "ARMAZENADO",
        "EXPORTADO",
      ],
      enum_status_onda_carregamento: [
        "CRIADA",
        "LIBERADO",
        "EM_PICKING",
        "SEPARADO",
        "EM_CONFERENCIA",
        "CONFERIDO",
        "EM_CARREGAMENTO",
        "CONCLUIDA",
        "CANCELADA",
      ],
      enum_status_tarefa: [
        "CRIADA",
        "ATRIBUIDA",
        "EM_ANDAMENTO",
        "PAUSADA",
        "CONCLUIDA",
        "CANCELADA",
      ],
      enum_status_volume: ["ABERTO", "FECHADO", "CONFERIDO", "EXPEDIDO"],
      enum_tamanho_hu: ["P", "M", "G", "GG", "EG"],
      enum_tipo_box: ["RECEBIMENTO", "SEPARACAO", "EXPEDICAO"],
      enum_tipo_controle: ["UNIDADE", "LOTE", "VALIDADE", "SERIE", "METROS"],
      enum_tipo_convocacao: [
        "AUTO_CONVOCADO",
        "CONVOCACAO_GESTOR",
        "CONVOCACAO_ATIVA",
      ],
      enum_tipo_endereco: ["PULMAO", "PICKING"],
      enum_tipo_evento_execucao: [
        "SCAN",
        "PESAGEM",
        "CONFIRMACAO_LOCAL",
        "PAUSE",
        "RESUME",
        "ERRO",
        "DIVERGENCIA",
        "INICIO_EXECUCAO",
        "FIM_EXECUCAO",
        "ATRIBUICAO",
        "SCAN_LOTE",
        "CONFIRMACAO_LOTE",
      ],
      enum_tipo_grupo: ["PICKING", "ARMAZENAGEM", "INVENTARIO"],
      enum_tipo_hu: ["PALLET", "CAIXA", "VOLUME", "OUTRO"],
      enum_tipo_inventario: ["GERAL", "CICLICO", "AUDITORIA"],
      enum_tipo_operacao: [
        "RECEBIMENTO",
        "ARMAZENAGEM",
        "MOVIMENTOS",
        "SEPARACAO",
        "CONFERENCIA",
        "EXPEDICAO",
        "AUDITORIA",
      ],
      enum_tipo_parceiro: ["CLIENTE", "FORNECEDOR", "TRANSPORTADOR"],
      enum_tipo_picking: ["MASTER", "FRACIONADO", "PDV"],
      enum_tipo_separacao: ["FRACIONADO", "EMBALAGEM_TOTAL", "CAIXARIA"],
      enum_tipo_setor: [
        "PICKING",
        "PULMAO",
        "RECEBIMENTO",
        "QUARENTENA",
        "EXPEDICAO",
      ],
      enum_tipo_usuario: ["ADMINISTRADOR", "GESTOR", "OPERADOR"],
      enum_tipo_veiculo: [
        "VUC",
        "3/4",
        "TOCO",
        "TRUCK",
        "BITRUCK",
        "BITREM",
        "RODOTREM",
        "OUTROS",
      ],
      tipo_estrutura_armazem: [
        "PORTA PALLET",
        "BLOCADO",
        "PRATELEIRA",
        "FLOW RACK",
        "DRIVE IN",
        "MEZANINO",
        "DOCA",
      ],
    },
  },
} as const
