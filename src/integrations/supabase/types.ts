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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      abastecimento: {
        Row: {
          armazem_id: string
          criado_em: string
          criado_por: string | null
          empresa_id: string
          finalizado_em: string | null
          id: string
          observacao: string | null
          status: Database["public"]["Enums"]["enum_status_abastecimento"]
          tenant_id: string
          tipo: Database["public"]["Enums"]["enum_tipo_abastecimento"]
          total_itens: number
          total_tarefas: number
        }
        Insert: {
          armazem_id: string
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          finalizado_em?: string | null
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["enum_status_abastecimento"]
          tenant_id: string
          tipo: Database["public"]["Enums"]["enum_tipo_abastecimento"]
          total_itens?: number
          total_tarefas?: number
        }
        Update: {
          armazem_id?: string
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          finalizado_em?: string | null
          id?: string
          observacao?: string | null
          status?: Database["public"]["Enums"]["enum_status_abastecimento"]
          tenant_id?: string
          tipo?: Database["public"]["Enums"]["enum_tipo_abastecimento"]
          total_itens?: number
          total_tarefas?: number
        }
        Relationships: [
          {
            foreignKeyName: "abastecimento_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      agrupamento_conferencia: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          sequencia: number | null
          tenant_id: string | null
          tipo_agrupamento:
            | Database["public"]["Enums"]["enum_agrupar_conf_por"]
            | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          sequencia?: number | null
          tenant_id?: string | null
          tipo_agrupamento?:
            | Database["public"]["Enums"]["enum_agrupar_conf_por"]
            | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          sequencia?: number | null
          tenant_id?: string | null
          tipo_agrupamento?:
            | Database["public"]["Enums"]["enum_agrupar_conf_por"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "agrupamento_conferencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupamento_conferencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agrupamento_conferencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "agrupamento_separacao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "armazem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      armazem_config: {
        Row: {
          armazem_id: string
          ativo: boolean
          created_at: string
          created_by: string | null
          empresa_id: string
          endereco_armazenagem_automatica_id: string | null
          endereco_avaria_id: string | null
          endereco_cancelamento_id: string | null
          endereco_quarentena_id: string | null
          id: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id: string
          endereco_armazenagem_automatica_id?: string | null
          endereco_avaria_id?: string | null
          endereco_cancelamento_id?: string | null
          endereco_quarentena_id?: string | null
          id?: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          endereco_armazenagem_automatica_id?: string | null
          endereco_avaria_id?: string | null
          endereco_cancelamento_id?: string | null
          endereco_quarentena_id?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "armazem_config_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_armazenagem_automatica_id_fkey"
            columns: ["endereco_armazenagem_automatica_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_armazenagem_automatica_id_fkey"
            columns: ["endereco_armazenagem_automatica_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_avaria_id_fkey"
            columns: ["endereco_avaria_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_avaria_id_fkey"
            columns: ["endereco_avaria_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_cancelamento_id_fkey"
            columns: ["endereco_cancelamento_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_cancelamento_id_fkey"
            columns: ["endereco_cancelamento_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_quarentena_id_fkey"
            columns: ["endereco_quarentena_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_endereco_quarentena_id_fkey"
            columns: ["endereco_quarentena_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "armazem_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuario"
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
          tipo_box: Database["public"]["Enums"]["enum_tipo_box"] | null
          tipo_box_id: string | null
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id: string
          tipo_box?: Database["public"]["Enums"]["enum_tipo_box"] | null
          tipo_box_id?: string | null
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string
          tipo_box?: Database["public"]["Enums"]["enum_tipo_box"] | null
          tipo_box_id?: string | null
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
            foreignKeyName: "box_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          chave_nfe: string | null
          codigo_erp: string | null
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
          chave_nfe?: string | null
          codigo_erp?: string | null
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
          chave_nfe?: string | null
          codigo_erp?: string | null
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
            foreignKeyName: "documento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "documento_entrada_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "documento_entrada_item_lote_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      documento_saida: {
        Row: {
          codigo_erp: string | null
          data_emissao: string
          empresa_id: string
          id: string
          id_externo: string | null
          numero_pedido: number
          observacao: string | null
          parceiro_id: string
          prioridade_externa: string | null
          rota_id: string | null
          sincronizado_em: string | null
          sistema_origem: string | null
          status: number
          status_integracao: string | null
          tenant_id: string
          tentativas_processamento: number | null
          tipo_pedido_id: string
          transportador: string | null
          valor_pedido: number
          vendedor: string | null
        }
        Insert: {
          codigo_erp?: string | null
          data_emissao: string
          empresa_id: string
          id?: string
          id_externo?: string | null
          numero_pedido: number
          observacao?: string | null
          parceiro_id: string
          prioridade_externa?: string | null
          rota_id?: string | null
          sincronizado_em?: string | null
          sistema_origem?: string | null
          status: number
          status_integracao?: string | null
          tenant_id: string
          tentativas_processamento?: number | null
          tipo_pedido_id: string
          transportador?: string | null
          valor_pedido: number
          vendedor?: string | null
        }
        Update: {
          codigo_erp?: string | null
          data_emissao?: string
          empresa_id?: string
          id?: string
          id_externo?: string | null
          numero_pedido?: number
          observacao?: string | null
          parceiro_id?: string
          prioridade_externa?: string | null
          rota_id?: string | null
          sincronizado_em?: string | null
          sistema_origem?: string | null
          status?: number
          status_integracao?: string | null
          tenant_id?: string
          tentativas_processamento?: number | null
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
            foreignKeyName: "fk_doc_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          codigo_erp: string | null
          codigo_erp_produto: string | null
          documento_saida_id: string
          id: string
          produto_id: string
          quantidade: number
          sistema_origem: string | null
          status_mapeamento: string | null
          tenant_id: string
          valor_total: number
          valor_unit: number
        }
        Insert: {
          codigo_erp?: string | null
          codigo_erp_produto?: string | null
          documento_saida_id: string
          id?: string
          produto_id: string
          quantidade: number
          sistema_origem?: string | null
          status_mapeamento?: string | null
          tenant_id: string
          valor_total: number
          valor_unit: number
        }
        Update: {
          codigo_erp?: string | null
          codigo_erp_produto?: string | null
          documento_saida_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
          sistema_origem?: string | null
          status_mapeamento?: string | null
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
            foreignKeyName: "fk_doc_saida_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_item_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_item_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "fk_doc_saida_item_lote_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      empresa: {
        Row: {
          ativo: boolean
          cnpj: string
          codigo: string | null
          id: string
          razaosocial: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          cnpj: string
          codigo?: string | null
          id?: string
          razaosocial: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          cnpj?: string
          codigo?: string | null
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
          {
            foreignKeyName: "empresa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "endereco_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      endereco_zona_atividade: {
        Row: {
          created_at: string
          endereco_id: string
          id: string
          tenant_id: string
          zona_atividade_id: string
        }
        Insert: {
          created_at?: string
          endereco_id: string
          id?: string
          tenant_id: string
          zona_atividade_id: string
        }
        Update: {
          created_at?: string
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
            foreignKeyName: "endereco_zona_atividade_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
            foreignKeyName: "endereco_zona_atividade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      erp_conexao: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          empresa_id: string
          id: string
          sistema: string
          tenant_id: string
          updated_at: string
          webhook_ativo: boolean
          webhook_secret: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id: string
          id?: string
          sistema?: string
          tenant_id: string
          updated_at?: string
          webhook_ativo?: boolean
          webhook_secret: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          empresa_id?: string
          id?: string
          sistema?: string
          tenant_id?: string
          updated_at?: string
          webhook_ativo?: boolean
          webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_conexao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_conexao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_conexao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "estoque_geral_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
          {
            foreignKeyName: "estoque_geral_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
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
          estorno_da_execucao_id: string | null
          hu_id: string | null
          id: string
          lote: string | null
          numero_serie: string | null
          produto_id: string
          quantidade: number
          saldo_anterior_destino: number | null
          saldo_anterior_origem: number | null
          saldo_posterior_destino: number | null
          saldo_posterior_origem: number | null
          tarefa_execucao_id: string | null
          tenant_id: string
          tipo_documento_origem: string | null
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
          estorno_da_execucao_id?: string | null
          hu_id?: string | null
          id?: string
          lote?: string | null
          numero_serie?: string | null
          produto_id: string
          quantidade: number
          saldo_anterior_destino?: number | null
          saldo_anterior_origem?: number | null
          saldo_posterior_destino?: number | null
          saldo_posterior_origem?: number | null
          tarefa_execucao_id?: string | null
          tenant_id: string
          tipo_documento_origem?: string | null
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
          estorno_da_execucao_id?: string | null
          hu_id?: string | null
          id?: string
          lote?: string | null
          numero_serie?: string | null
          produto_id?: string
          quantidade?: number
          saldo_anterior_destino?: number | null
          saldo_anterior_origem?: number | null
          saldo_posterior_destino?: number | null
          saldo_posterior_origem?: number | null
          tarefa_execucao_id?: string | null
          tenant_id?: string
          tipo_documento_origem?: string | null
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
            foreignKeyName: "estoque_movimento_endereco_destino_id_fkey"
            columns: ["endereco_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
            foreignKeyName: "estoque_movimento_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_estorno_da_execucao_id_fkey"
            columns: ["estorno_da_execucao_id"]
            isOneToOne: false
            referencedRelation: "tarefa_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_estorno_da_execucao_id_fkey"
            columns: ["estorno_da_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_inventario_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_estorno_da_execucao_id_fkey"
            columns: ["estorno_da_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_lms_timeline_operador"
            referencedColumns: ["execucao_id"]
          },
          {
            foreignKeyName: "estoque_movimento_estorno_da_execucao_id_fkey"
            columns: ["estorno_da_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "estoque_movimento_estorno_da_execucao_id_fkey"
            columns: ["estorno_da_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
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
            foreignKeyName: "estoque_movimento_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
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
            referencedRelation: "vw_inventario_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_lms_timeline_operador"
            referencedColumns: ["execucao_id"]
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
            foreignKeyName: "estoque_movimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      etiqueta_template: {
        Row: {
          ativo: boolean
          campos: Json
          com_cabecalho: boolean
          com_logo: boolean
          created_at: string
          created_by: string | null
          empresa_id: string | null
          id: string
          logo_url: string | null
          nome: string
          orientacao: string
          tamanho: string
          tenant_id: string
          tipo: string
          updated_at: string
          updated_by: string | null
          versao: number
        }
        Insert: {
          ativo?: boolean
          campos?: Json
          com_cabecalho?: boolean
          com_logo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          logo_url?: string | null
          nome: string
          orientacao?: string
          tamanho?: string
          tenant_id: string
          tipo: string
          updated_at?: string
          updated_by?: string | null
          versao?: number
        }
        Update: {
          ativo?: boolean
          campos?: Json
          com_cabecalho?: boolean
          com_logo?: boolean
          created_at?: string
          created_by?: string | null
          empresa_id?: string | null
          id?: string
          logo_url?: string | null
          nome?: string
          orientacao?: string
          tamanho?: string
          tenant_id?: string
          tipo?: string
          updated_at?: string
          updated_by?: string | null
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "etiqueta_template_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiqueta_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "etiqueta_template_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "grupo_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "hu_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario: {
        Row: {
          acuracidade: number | null
          armazem_id: string | null
          bloquear_movimentacao: boolean | null
          considerar_saldo_atual: boolean | null
          criado_em: string | null
          criado_por: string | null
          criterio_selecao:
            | Database["public"]["Enums"]["enum_criterio_selecao_inventario"]
            | null
          cursor_processamento: number | null
          curva: Database["public"]["Enums"]["enum_curva"] | null
          data_fim_analise: string | null
          data_inicio_analise: string | null
          data_planejada: string | null
          descricao: string | null
          empresa_id: string
          endereco_id: string | null
          finalizado_em: string | null
          finalizado_por: string | null
          grupo_produto_id: string | null
          id: string
          iniciado_em: string | null
          max_enderecos_dia: number | null
          numero_inventario: number
          observacao: string | null
          origem: Database["public"]["Enums"]["enum_origem_inventario"] | null
          permite_recontagem: boolean | null
          priorizar_picking: boolean | null
          produto_id: string | null
          quantidade_max_recontagem: number | null
          status: Database["public"]["Enums"]["enum_status_inventario"]
          tenant_id: string
          tipo_execucao:
            | Database["public"]["Enums"]["enum_execucao_inventario"]
            | null
          tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
          total_divergencias: number | null
          total_itens: number | null
          updated_at: string | null
          updated_by: string | null
          zona_atividade_id: string | null
        }
        Insert: {
          acuracidade?: number | null
          armazem_id?: string | null
          bloquear_movimentacao?: boolean | null
          considerar_saldo_atual?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          criterio_selecao?:
            | Database["public"]["Enums"]["enum_criterio_selecao_inventario"]
            | null
          cursor_processamento?: number | null
          curva?: Database["public"]["Enums"]["enum_curva"] | null
          data_fim_analise?: string | null
          data_inicio_analise?: string | null
          data_planejada?: string | null
          descricao?: string | null
          empresa_id: string
          endereco_id?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          grupo_produto_id?: string | null
          id?: string
          iniciado_em?: string | null
          max_enderecos_dia?: number | null
          numero_inventario?: never
          observacao?: string | null
          origem?: Database["public"]["Enums"]["enum_origem_inventario"] | null
          permite_recontagem?: boolean | null
          priorizar_picking?: boolean | null
          produto_id?: string | null
          quantidade_max_recontagem?: number | null
          status?: Database["public"]["Enums"]["enum_status_inventario"]
          tenant_id: string
          tipo_execucao?:
            | Database["public"]["Enums"]["enum_execucao_inventario"]
            | null
          tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
          total_divergencias?: number | null
          total_itens?: number | null
          updated_at?: string | null
          updated_by?: string | null
          zona_atividade_id?: string | null
        }
        Update: {
          acuracidade?: number | null
          armazem_id?: string | null
          bloquear_movimentacao?: boolean | null
          considerar_saldo_atual?: boolean | null
          criado_em?: string | null
          criado_por?: string | null
          criterio_selecao?:
            | Database["public"]["Enums"]["enum_criterio_selecao_inventario"]
            | null
          cursor_processamento?: number | null
          curva?: Database["public"]["Enums"]["enum_curva"] | null
          data_fim_analise?: string | null
          data_inicio_analise?: string | null
          data_planejada?: string | null
          descricao?: string | null
          empresa_id?: string
          endereco_id?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          grupo_produto_id?: string | null
          id?: string
          iniciado_em?: string | null
          max_enderecos_dia?: number | null
          numero_inventario?: never
          observacao?: string | null
          origem?: Database["public"]["Enums"]["enum_origem_inventario"] | null
          permite_recontagem?: boolean | null
          priorizar_picking?: boolean | null
          produto_id?: string | null
          quantidade_max_recontagem?: number | null
          status?: Database["public"]["Enums"]["enum_status_inventario"]
          tenant_id?: string
          tipo_execucao?:
            | Database["public"]["Enums"]["enum_execucao_inventario"]
            | null
          tipo_inventario?: Database["public"]["Enums"]["enum_tipo_inventario"]
          total_divergencias?: number | null
          total_itens?: number | null
          updated_at?: string | null
          updated_by?: string | null
          zona_atividade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_inventario_endereco"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventario_endereco"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventario_grupo_produto"
            columns: ["grupo_produto_id"]
            isOneToOne: false
            referencedRelation: "grupo_produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventario_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventario_produto"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_inventario_zona_atividade"
            columns: ["zona_atividade_id"]
            isOneToOne: false
            referencedRelation: "zona_atividade"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_armazem_fk"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_empresa_fk"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_usuario_criacao_fk"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_usuario_finalizacao_fk"
            columns: ["finalizado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      inventario_tipo_tarefa: {
        Row: {
          tenant_id: string
          tipo_execucao: Database["public"]["Enums"]["enum_execucao_inventario"]
          tipo_tarefa_id: string
        }
        Insert: {
          tenant_id: string
          tipo_execucao: Database["public"]["Enums"]["enum_execucao_inventario"]
          tipo_tarefa_id: string
        }
        Update: {
          tenant_id?: string
          tipo_execucao?: Database["public"]["Enums"]["enum_execucao_inventario"]
          tipo_tarefa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventario_tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tipo_tarefa_tipo_tarefa_id_fkey"
            columns: ["tipo_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tipo_tarefa"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_metrica_diaria: {
        Row: {
          armazem_id: string
          data_referencia: string
          documentos_processados: number | null
          empresa_id: string
          id: string
          peso_total: number | null
          produtividade_hora: number | null
          quantidade_total: number | null
          skus_distintos: number | null
          tarefas_canceladas: number | null
          tarefas_concluidas: number | null
          taxa_ocupacao: number | null
          tempo_auxiliar: number | null
          tempo_jornada: number | null
          tempo_ocioso: number | null
          tempo_produtivo: number | null
          tenant_id: string
          turno_id: string | null
          usuario_id: string
        }
        Insert: {
          armazem_id: string
          data_referencia: string
          documentos_processados?: number | null
          empresa_id: string
          id?: string
          peso_total?: number | null
          produtividade_hora?: number | null
          quantidade_total?: number | null
          skus_distintos?: number | null
          tarefas_canceladas?: number | null
          tarefas_concluidas?: number | null
          taxa_ocupacao?: number | null
          tempo_auxiliar?: number | null
          tempo_jornada?: number | null
          tempo_ocioso?: number | null
          tempo_produtivo?: number | null
          tenant_id: string
          turno_id?: string | null
          usuario_id: string
        }
        Update: {
          armazem_id?: string
          data_referencia?: string
          documentos_processados?: number | null
          empresa_id?: string
          id?: string
          peso_total?: number | null
          produtividade_hora?: number | null
          quantidade_total?: number | null
          skus_distintos?: number | null
          tarefas_canceladas?: number | null
          tarefas_concluidas?: number | null
          taxa_ocupacao?: number | null
          tempo_auxiliar?: number | null
          tempo_jornada?: number | null
          tempo_ocioso?: number | null
          tempo_produtivo?: number | null
          tenant_id?: string
          turno_id?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_metrica_diaria_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_diaria_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_diaria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_diaria_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_diaria_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_diaria_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      lms_metrica_tipo_tarefa: {
        Row: {
          data_referencia: string
          id: string
          quantidade_total: number | null
          tarefas_concluidas: number | null
          tempo_medio_segundos: number | null
          tempo_total_segundos: number | null
          tenant_id: string
          tipo_tarefa_id: string
          usuario_id: string
        }
        Insert: {
          data_referencia: string
          id?: string
          quantidade_total?: number | null
          tarefas_concluidas?: number | null
          tempo_medio_segundos?: number | null
          tempo_total_segundos?: number | null
          tenant_id: string
          tipo_tarefa_id: string
          usuario_id: string
        }
        Update: {
          data_referencia?: string
          id?: string
          quantidade_total?: number | null
          tarefas_concluidas?: number | null
          tempo_medio_segundos?: number | null
          tempo_total_segundos?: number | null
          tenant_id?: string
          tipo_tarefa_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lms_metrica_tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_tipo_tarefa_tipo_tarefa_id_fkey"
            columns: ["tipo_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tipo_tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lms_metrica_tipo_tarefa_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      log_cron_execucao: {
        Row: {
          duracao_ms: number | null
          erro: string | null
          executado_em: string
          id: string
          nome_cron: string
          resultado: Json | null
          sucesso: boolean
          tenant_id: string
        }
        Insert: {
          duracao_ms?: number | null
          erro?: string | null
          executado_em?: string
          id?: string
          nome_cron: string
          resultado?: Json | null
          sucesso?: boolean
          tenant_id: string
        }
        Update: {
          duracao_ms?: number | null
          erro?: string | null
          executado_em?: string
          id?: string
          nome_cron?: string
          resultado?: Json | null
          sucesso?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_cron_execucao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_cron_execucao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "log_sessao_usuario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      modulo: {
        Row: {
          ambiente: Database["public"]["Enums"]["enum_ambiente_modulo"]
          ativo: boolean
          codigo: string
          descricao: string
          id: string
          tenant_id: string | null
        }
        Insert: {
          ambiente?: Database["public"]["Enums"]["enum_ambiente_modulo"]
          ativo?: boolean
          codigo: string
          descricao: string
          id?: string
          tenant_id?: string | null
        }
        Update: {
          ambiente?: Database["public"]["Enums"]["enum_ambiente_modulo"]
          ativo?: boolean
          codigo?: string
          descricao?: string
          id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "modulo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modulo_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      motivo_ocorrencia: {
        Row: {
          acao_automatica: string | null
          armazem_id: string | null
          ativo: boolean
          categoria_padrao:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          descricao: string
          empresa_id: string | null
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id: string
          prioridade_padrao:
            | Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
            | null
          tenant_id: string
          tipo_ocorrencia_padrao:
            | Database["public"]["Enums"]["enum_tipo_ocorrencia"]
            | null
        }
        Insert: {
          acao_automatica?: string | null
          armazem_id?: string | null
          ativo?: boolean
          categoria_padrao?:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          descricao: string
          empresa_id?: string | null
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id?: string
          prioridade_padrao?:
            | Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
            | null
          tenant_id: string
          tipo_ocorrencia_padrao?:
            | Database["public"]["Enums"]["enum_tipo_ocorrencia"]
            | null
        }
        Update: {
          acao_automatica?: string | null
          armazem_id?: string | null
          ativo?: boolean
          categoria_padrao?:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          descricao?: string
          empresa_id?: string | null
          etapa_ocorrencia?: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          id?: string
          prioridade_padrao?:
            | Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
            | null
          tenant_id?: string
          tipo_ocorrencia_padrao?:
            | Database["public"]["Enums"]["enum_tipo_ocorrencia"]
            | null
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
            foreignKeyName: "motivo_ocorrencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivo_ocorrencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motivo_ocorrencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          tipo_entrada_id: string | null
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
          tipo_entrada_id?: string | null
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
          tipo_entrada_id?: string | null
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
            foreignKeyName: "movimento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_tipo_entrada_id_fkey"
            columns: ["tipo_entrada_id"]
            isOneToOne: false
            referencedRelation: "tipo_entrada"
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
            referencedRelation: "vw_movimento_entrada_info"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_lista"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "movimento_entrada_documento_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            referencedRelation: "vw_movimento_entrada_info"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_lista"
            referencedColumns: ["id"]
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
            foreignKeyName: "movimento_entrada_item_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          finalizado_em: string | null
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
          tipo_saida: string | null
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
          finalizado_em?: string | null
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
          tipo_saida?: string | null
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
          finalizado_em?: string | null
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
          tipo_saida?: string | null
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
            foreignKeyName: "fk_onda_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_veiculo"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_saida_tipo_saida_fkey"
            columns: ["tipo_saida"]
            isOneToOne: false
            referencedRelation: "tipo_saida"
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
            referencedRelation: "vw_movimento_saida_lista"
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
            foreignKeyName: "fk_onda_doc_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            referencedRelation: "vw_movimento_saida_lista"
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
          qtd_conferida: number
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
          qtd_conferida?: number
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
          qtd_conferida?: number
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
            referencedRelation: "vw_movimento_saida_lista"
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
            foreignKeyName: "fk_onda_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
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
            foreignKeyName: "fk_onda_item_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            referencedRelation: "vw_movimento_saida_lista"
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
      ocorrencia_historico: {
        Row: {
          criado_em: string
          id: string
          observacao: string | null
          ocorrencia_id: string
          status_anterior:
            | Database["public"]["Enums"]["enum_status_ocorrencia"]
            | null
          status_novo: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tenant_id: string
          usuario_id: string | null
        }
        Insert: {
          criado_em?: string
          id?: string
          observacao?: string | null
          ocorrencia_id: string
          status_anterior?:
            | Database["public"]["Enums"]["enum_status_ocorrencia"]
            | null
          status_novo: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tenant_id: string
          usuario_id?: string | null
        }
        Update: {
          criado_em?: string
          id?: string
          observacao?: string | null
          ocorrencia_id?: string
          status_anterior?:
            | Database["public"]["Enums"]["enum_status_ocorrencia"]
            | null
          status_novo?: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tenant_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencia_historico_ocorrencia_id_fkey"
            columns: ["ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "ocorrencia_operacional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_historico_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_historico_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencia_operacional: {
        Row: {
          armazem_id: string | null
          categoria:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          criado_em: string
          criado_por: string | null
          documento_origem_id: string | null
          empresa_id: string
          endereco_id: string | null
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          evidencia_url: string | null
          id: string
          lote: string | null
          motivo_ocorrencia_id: string | null
          numero_ocorrencia: number
          observacao: string | null
          prioridade: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          produto_id: string | null
          quantidade_divergente: number
          quantidade_esperada: number
          quantidade_real: number
          resolucao: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tarefa_execucao_id: string | null
          tarefa_id: string | null
          tenant_id: string
          tipo_documento_origem: string | null
          tipo_ocorrencia: Database["public"]["Enums"]["enum_tipo_ocorrencia"]
          updated_at: string
          updated_by: string | null
          usuario_causador_id: string | null
          validade: string | null
        }
        Insert: {
          armazem_id?: string | null
          categoria?:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          criado_em?: string
          criado_por?: string | null
          documento_origem_id?: string | null
          empresa_id: string
          endereco_id?: string | null
          etapa_ocorrencia: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          evidencia_url?: string | null
          id?: string
          lote?: string | null
          motivo_ocorrencia_id?: string | null
          numero_ocorrencia?: number
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          produto_id?: string | null
          quantidade_divergente?: number
          quantidade_esperada?: number
          quantidade_real?: number
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tarefa_execucao_id?: string | null
          tarefa_id?: string | null
          tenant_id: string
          tipo_documento_origem?: string | null
          tipo_ocorrencia: Database["public"]["Enums"]["enum_tipo_ocorrencia"]
          updated_at?: string
          updated_by?: string | null
          usuario_causador_id?: string | null
          validade?: string | null
        }
        Update: {
          armazem_id?: string | null
          categoria?:
            | Database["public"]["Enums"]["enum_categoria_ocorrencia"]
            | null
          criado_em?: string
          criado_por?: string | null
          documento_origem_id?: string | null
          empresa_id?: string
          endereco_id?: string | null
          etapa_ocorrencia?: Database["public"]["Enums"]["enum_etapa_ocorrencia"]
          evidencia_url?: string | null
          id?: string
          lote?: string | null
          motivo_ocorrencia_id?: string | null
          numero_ocorrencia?: number
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          produto_id?: string | null
          quantidade_divergente?: number
          quantidade_esperada?: number
          quantidade_real?: number
          resolucao?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: Database["public"]["Enums"]["enum_status_ocorrencia"]
          tarefa_execucao_id?: string | null
          tarefa_id?: string | null
          tenant_id?: string
          tipo_documento_origem?: string | null
          tipo_ocorrencia?: Database["public"]["Enums"]["enum_tipo_ocorrencia"]
          updated_at?: string
          updated_by?: string | null
          usuario_causador_id?: string | null
          validade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencia_operacional_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_motivo_ocorrencia_id_fkey"
            columns: ["motivo_ocorrencia_id"]
            isOneToOne: false
            referencedRelation: "motivo_ocorrencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_resolvido_por_fkey"
            columns: ["resolvido_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "tarefa_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_inventario_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_lms_timeline_operador"
            referencedColumns: ["execucao_id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_execucao_id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "inventario_item_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_conferencia_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_saida_separacao_detalhe"
            referencedColumns: ["tarefa_id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_operacional_usuario_causador_id_fkey"
            columns: ["usuario_causador_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ocorrencia_sla_config: {
        Row: {
          armazem_id: string | null
          ativo: boolean
          created_at: string
          created_by: string | null
          id: string
          notificar_percentual: number
          prioridade: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          sla_horas: number
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          armazem_id?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notificar_percentual?: number
          prioridade: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          sla_horas: number
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          armazem_id?: string | null
          ativo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          notificar_percentual?: number
          prioridade?: Database["public"]["Enums"]["enum_prioridade_ocorrencia"]
          sla_horas?: number
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencia_sla_config_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_sla_config_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_sla_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_sla_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencia_sla_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      ordem_expedicao: {
        Row: {
          armazem_id: string | null
          created_at: string
          empresa_id: string | null
          id: string
          ordem: string | null
          rua: number | null
          sequencia: number | null
          tenant_id: string | null
        }
        Insert: {
          armazem_id?: string | null
          created_at?: string
          empresa_id?: string | null
          id?: string
          ordem?: string | null
          rua?: number | null
          sequencia?: number | null
          tenant_id?: string | null
        }
        Update: {
          armazem_id?: string | null
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
            foreignKeyName: "ordem_expedicao_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "ordem_expedixao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "parceiro_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          ativo: boolean
          descricao: string | null
          id: string
          nome: string
          sistema: boolean
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          descricao?: string | null
          id?: string
          nome: string
          sistema?: boolean
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          descricao?: string | null
          id?: string
          nome?: string
          sistema?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil_permissao: {
        Row: {
          id: string
          perfil_id: string
          permissao_id: string
          tenant_id: string
        }
        Insert: {
          id?: string
          perfil_id: string
          permissao_id: string
          tenant_id: string
        }
        Update: {
          id?: string
          perfil_id?: string
          permissao_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_permissao_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissao_permissao_id_fkey"
            columns: ["permissao_id"]
            isOneToOne: false
            referencedRelation: "permissao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfil_permissao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      permissao: {
        Row: {
          acao: Database["public"]["Enums"]["enum_acao_permissao"]
          descricao: string | null
          id: string
          modulo_id: string
          tenant_id: string | null
        }
        Insert: {
          acao: Database["public"]["Enums"]["enum_acao_permissao"]
          descricao?: string | null
          id?: string
          modulo_id: string
          tenant_id?: string | null
        }
        Update: {
          acao?: Database["public"]["Enums"]["enum_acao_permissao"]
          descricao?: string | null
          id?: string
          modulo_id?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissao_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_produto: {
        Row: {
          armazem_id: string
          ativo: boolean
          empresa_id: string
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
          empresa_id: string
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
          empresa_id?: string
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
            foreignKeyName: "picking_produto_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
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
            foreignKeyName: "picking_produto_endereco_id_fkey"
            columns: ["endereco_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
            foreignKeyName: "picking_produto_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_support_user: {
        Row: {
          ativo: boolean
          auth_user_id: string
          created_at: string
          email: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      produto: {
        Row: {
          ativo: boolean
          camada: number | null
          codigo_erp: string | null
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
          peso_bruto: number | null
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
          codigo_erp?: string | null
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
          peso_bruto?: number | null
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
          codigo_erp?: string | null
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
          peso_bruto?: number | null
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
          {
            foreignKeyName: "produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_embalagem: {
        Row: {
          altura: number | null
          ativo: boolean
          codigo_erp: string | null
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
          codigo_erp?: string | null
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
          codigo_erp?: string | null
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
            foreignKeyName: "produto_embalagem_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_embalagem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_embalagem_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      rotas: {
        Row: {
          armazem_id: string
          ativo: boolean
          codigo_erp: string | null
          descricao: string
          empresa_id: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          ativo?: boolean
          codigo_erp?: string | null
          descricao: string
          empresa_id?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          ativo?: boolean
          codigo_erp?: string | null
          descricao?: string
          empresa_id?: string | null
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
            foreignKeyName: "rotas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "sequencia_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequencia_tenant_id_fkey1"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sequencia_tenant_id_fkey1"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "setor_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "subgrupo_produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      support_chamado: {
        Row: {
          atendido_em: string | null
          atendido_por: string | null
          criado_em: string
          criado_por: string | null
          descricao: string | null
          id: string
          prioridade: string
          resposta: string | null
          status: string
          tenant_id: string
          titulo: string
        }
        Insert: {
          atendido_em?: string | null
          atendido_por?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          prioridade?: string
          resposta?: string | null
          status?: string
          tenant_id: string
          titulo: string
        }
        Update: {
          atendido_em?: string | null
          atendido_por?: string | null
          criado_em?: string
          criado_por?: string | null
          descricao?: string | null
          id?: string
          prioridade?: string
          resposta?: string | null
          status?: string
          tenant_id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_chamado_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_chamado_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefa: {
        Row: {
          armazem_id: string | null
          auto_separacao: boolean
          concluido_em: string | null
          contagem_inventario: number | null
          criado_em: string
          criado_por: string | null
          empresa_id: string
          id: string
          id_documento_origem: string | null
          id_local_destino: string | null
          id_local_origem: string | null
          motivo_ocorrencia: string | null
          ordem_tarefa: number | null
          percentual_execucao: number | null
          prioridade_tarefa:
            | Database["public"]["Enums"]["enum_prioridade_onda"]
            | null
          produto_id: string | null
          quantidade_cortada: number | null
          quantidade_executada: number
          quantidade_executada2: number | null
          quantidade_executada3: number | null
          quantidade_executada4: number | null
          quantidade_requerida: number | null
          status: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id: string
          tipo_documento_origem: string | null
          tipo_tarefa_id: string
          usuario_cortou: string | null
        }
        Insert: {
          armazem_id?: string | null
          auto_separacao?: boolean
          concluido_em?: string | null
          contagem_inventario?: number | null
          criado_em?: string
          criado_por?: string | null
          empresa_id: string
          id?: string
          id_documento_origem?: string | null
          id_local_destino?: string | null
          id_local_origem?: string | null
          motivo_ocorrencia?: string | null
          ordem_tarefa?: number | null
          percentual_execucao?: number | null
          prioridade_tarefa?:
            | Database["public"]["Enums"]["enum_prioridade_onda"]
            | null
          produto_id?: string | null
          quantidade_cortada?: number | null
          quantidade_executada?: number
          quantidade_executada2?: number | null
          quantidade_executada3?: number | null
          quantidade_executada4?: number | null
          quantidade_requerida?: number | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id: string
          tipo_documento_origem?: string | null
          tipo_tarefa_id: string
          usuario_cortou?: string | null
        }
        Update: {
          armazem_id?: string | null
          auto_separacao?: boolean
          concluido_em?: string | null
          contagem_inventario?: number | null
          criado_em?: string
          criado_por?: string | null
          empresa_id?: string
          id?: string
          id_documento_origem?: string | null
          id_local_destino?: string | null
          id_local_origem?: string | null
          motivo_ocorrencia?: string | null
          ordem_tarefa?: number | null
          percentual_execucao?: number | null
          prioridade_tarefa?:
            | Database["public"]["Enums"]["enum_prioridade_onda"]
            | null
          produto_id?: string | null
          quantidade_cortada?: number | null
          quantidade_executada?: number
          quantidade_executada2?: number | null
          quantidade_executada3?: number | null
          quantidade_executada4?: number | null
          quantidade_requerida?: number | null
          status?: Database["public"]["Enums"]["enum_status_tarefa"]
          tenant_id?: string
          tipo_documento_origem?: string | null
          tipo_tarefa_id?: string
          usuario_cortou?: string | null
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
            foreignKeyName: "tarefa_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
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
            foreignKeyName: "tarefa_id_local_destino_fkey"
            columns: ["id_local_destino"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
            foreignKeyName: "tarefa_id_local_origem_fkey"
            columns: ["id_local_origem"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_motivo_ocorrencia_fkey"
            columns: ["motivo_ocorrencia"]
            isOneToOne: false
            referencedRelation: "motivo_ocorrencia"
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
            foreignKeyName: "tarefa_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
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
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_tipo_tarefa_id_fkey"
            columns: ["tipo_tarefa_id"]
            isOneToOne: false
            referencedRelation: "tipo_tarefa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_usuario_cortou_fkey"
            columns: ["usuario_cortou"]
            isOneToOne: false
            referencedRelation: "usuario"
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
            referencedRelation: "inventario_item_resumo"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "vw_inventario_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evento_execucao_tarefa_execucao_tarefa_id_fkey"
            columns: ["execucao_tarefa_id"]
            isOneToOne: false
            referencedRelation: "vw_lms_timeline_operador"
            referencedColumns: ["execucao_id"]
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
            foreignKeyName: "evento_execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_evento_execucao_tarefa_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "inventario_item_resumo"
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
          modo_conferencia: string
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
          modo_conferencia?: string
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
          modo_conferencia?: string
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
            referencedRelation: "inventario_item_resumo"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "tarefa_execucao_endereco_destino_id_fkey"
            columns: ["endereco_destino_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
            foreignKeyName: "tarefa_execucao_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
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
      tenant: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          slug: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          slug: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          slug?: string
        }
        Relationships: []
      }
      tipo_box: {
        Row: {
          armazem_id: string | null
          ativo: boolean
          descricao: string
          id: string
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["enum_tipo_box"]
        }
        Insert: {
          armazem_id?: string | null
          ativo?: boolean
          descricao: string
          id?: string
          tenant_id?: string | null
          tipo: Database["public"]["Enums"]["enum_tipo_box"]
        }
        Update: {
          armazem_id?: string | null
          ativo?: boolean
          descricao?: string
          id?: string
          tenant_id?: string | null
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
          {
            foreignKeyName: "tipo_box_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_entrada: {
        Row: {
          armazenagem_automatica: boolean
          ativo: boolean
          codigo_erp: string | null
          descricao: string
          empresa_id: string
          gera_mov_automatico: boolean
          id: string
          libera_mov_automatico: boolean
          prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia: boolean
          tenant_id: string
        }
        Insert: {
          armazenagem_automatica?: boolean
          ativo?: boolean
          codigo_erp?: string | null
          descricao: string
          empresa_id: string
          gera_mov_automatico?: boolean
          id?: string
          libera_mov_automatico?: boolean
          prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia?: boolean
          tenant_id: string
        }
        Update: {
          armazenagem_automatica?: boolean
          ativo?: boolean
          codigo_erp?: string | null
          descricao?: string
          empresa_id?: string
          gera_mov_automatico?: boolean
          id?: string
          libera_mov_automatico?: boolean
          prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia?: boolean
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
          {
            foreignKeyName: "tipo_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_estoque: {
        Row: {
          armazem_id: string | null
          ativo: boolean
          codigo_erp: string
          descricao: string
          empresa_id: string
          id: string
          sigla: string | null
          tenant_id: string
        }
        Insert: {
          armazem_id?: string | null
          ativo?: boolean
          codigo_erp: string
          descricao: string
          empresa_id: string
          id?: string
          sigla?: string | null
          tenant_id: string
        }
        Update: {
          armazem_id?: string | null
          ativo?: boolean
          codigo_erp?: string
          descricao?: string
          empresa_id?: string
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
            foreignKeyName: "tipo_estoque_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipo_estoque_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      tipo_saida: {
        Row: {
          ativo: boolean
          codigo_erp: string | null
          conferencia_cega: boolean
          conferencia_checkout: boolean
          descricao: string
          empresa_id: string
          gera_abastecimento_automatico: boolean
          gera_mov_automatico: boolean
          gera_volume_etapa: Database["public"]["Enums"]["enum_momento_geracao_volume"]
          id: string
          libera_mov_automatico: boolean
          prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia: boolean
          separa_pulmao: boolean
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          codigo_erp?: string | null
          conferencia_cega?: boolean
          conferencia_checkout?: boolean
          descricao: string
          empresa_id: string
          gera_abastecimento_automatico?: boolean
          gera_mov_automatico?: boolean
          gera_volume_etapa?: Database["public"]["Enums"]["enum_momento_geracao_volume"]
          id?: string
          libera_mov_automatico?: boolean
          prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia?: boolean
          separa_pulmao?: boolean
          tenant_id: string
        }
        Update: {
          ativo?: boolean
          codigo_erp?: string | null
          conferencia_cega?: boolean
          conferencia_checkout?: boolean
          descricao?: string
          empresa_id?: string
          gera_abastecimento_automatico?: boolean
          gera_mov_automatico?: boolean
          gera_volume_etapa?: Database["public"]["Enums"]["enum_momento_geracao_volume"]
          id?: string
          libera_mov_automatico?: boolean
          prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          realiza_conferencia?: boolean
          separa_pulmao?: boolean
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
          {
            foreignKeyName: "fk_tipo_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "tipo_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "turnos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario: {
        Row: {
          armazem_id: string | null
          ativo: boolean
          auth_user_id: string | null
          codigo_erp: string | null
          created_at: string
          deve_trocar_senha: boolean
          email: string | null
          empresa_id: string
          habilidade: Database["public"]["Enums"]["enum_habilidade"]
          id: string
          login: string
          nome: string
          permite_checkout: boolean
          tenant_id: string
          tipo_operacao: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id: string | null
        }
        Insert: {
          armazem_id?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          codigo_erp?: string | null
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string | null
          empresa_id: string
          habilidade?: Database["public"]["Enums"]["enum_habilidade"]
          id?: string
          login: string
          nome: string
          permite_checkout?: boolean
          tenant_id: string
          tipo_operacao: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario?: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id?: string | null
        }
        Update: {
          armazem_id?: string | null
          ativo?: boolean
          auth_user_id?: string | null
          codigo_erp?: string | null
          created_at?: string
          deve_trocar_senha?: boolean
          email?: string | null
          empresa_id?: string
          habilidade?: Database["public"]["Enums"]["enum_habilidade"]
          id?: string
          login?: string
          nome?: string
          permite_checkout?: boolean
          tenant_id?: string
          tipo_operacao?: Database["public"]["Enums"]["enum_tipo_operacao"]
          tipo_usuario?: Database["public"]["Enums"]["enum_tipo_usuario"] | null
          turno_id?: string | null
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
            foreignKeyName: "usuario_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      usuario_perfil: {
        Row: {
          id: string
          perfil_id: string
          tenant_id: string
          usuario_id: string
        }
        Insert: {
          id?: string
          perfil_id: string
          tenant_id: string
          usuario_id: string
        }
        Update: {
          id?: string
          perfil_id?: string
          tenant_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_perfil_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_perfil_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
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
          {
            foreignKeyName: "veiculos_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      volume_expedicao: {
        Row: {
          codigo_volume: string
          created_at: string
          documento_saida_id: string | null
          empresa_id: string
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
          documento_saida_id?: string | null
          empresa_id: string
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
          documento_saida_id?: string | null
          empresa_id?: string
          id?: string
          m3?: number | null
          movimento_saida_id?: string
          peso_bruto?: number | null
          status?: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_expedicao_documento_saida_id_fkey"
            columns: ["documento_saida_id"]
            isOneToOne: false
            referencedRelation: "documento_saida"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "vw_movimento_saida_lista"
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
          {
            foreignKeyName: "volume_expedicao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_log_pedido_saida: {
        Row: {
          created_at: string
          documento_saida_id: string | null
          empresa_id: string | null
          id: string
          id_chamada: string
          mensagem_erro: string | null
          numero_pedido_externo: string | null
          payload_recebido: Json | null
          payload_resposta: Json | null
          sistema_origem: string
          status: string
          tempo_processamento_ms: number | null
          tenant_id: string
          total_itens_mapeados: number
          total_itens_recebidos: number
        }
        Insert: {
          created_at?: string
          documento_saida_id?: string | null
          empresa_id?: string | null
          id?: string
          id_chamada: string
          mensagem_erro?: string | null
          numero_pedido_externo?: string | null
          payload_recebido?: Json | null
          payload_resposta?: Json | null
          sistema_origem?: string
          status: string
          tempo_processamento_ms?: number | null
          tenant_id: string
          total_itens_mapeados?: number
          total_itens_recebidos?: number
        }
        Update: {
          created_at?: string
          documento_saida_id?: string | null
          empresa_id?: string | null
          id?: string
          id_chamada?: string
          mensagem_erro?: string | null
          numero_pedido_externo?: string | null
          payload_recebido?: Json | null
          payload_resposta?: Json | null
          sistema_origem?: string
          status?: string
          tempo_processamento_ms?: number | null
          tenant_id?: string
          total_itens_mapeados?: number
          total_itens_recebidos?: number
        }
        Relationships: [
          {
            foreignKeyName: "webhook_log_pedido_saida_documento_saida_id_fkey"
            columns: ["documento_saida_id"]
            isOneToOne: false
            referencedRelation: "documento_saida"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_log_pedido_saida_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_log_pedido_saida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_log_pedido_saida_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
          {
            foreignKeyName: "zona_atividade_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventario_item_resumo: {
        Row: {
          apto: number | null
          descricao: string | null
          divergência: number | null
          id: string | null
          inventario_id: string | null
          nivel: number | null
          predio: number | null
          primeira_contagem: number | null
          quantidade_requerida: number | null
          referencia: string | null
          rua: number | null
          saldo_final: number | null
          segunda_contagem: number | null
          sku: string | null
          status: Database["public"]["Enums"]["enum_status_tarefa"] | null
        }
        Relationships: []
      }
      v_inventario_iniciar: {
        Row: {
          id: string | null
          numero_inventario: number | null
          origem: Database["public"]["Enums"]["enum_origem_inventario"] | null
          status: Database["public"]["Enums"]["enum_status_inventario"] | null
          tipo_inventario:
            | Database["public"]["Enums"]["enum_tipo_inventario"]
            | null
        }
        Insert: {
          id?: string | null
          numero_inventario?: number | null
          origem?: Database["public"]["Enums"]["enum_origem_inventario"] | null
          status?: Database["public"]["Enums"]["enum_status_inventario"] | null
          tipo_inventario?:
            | Database["public"]["Enums"]["enum_tipo_inventario"]
            | null
        }
        Update: {
          id?: string | null
          numero_inventario?: number | null
          origem?: Database["public"]["Enums"]["enum_origem_inventario"] | null
          status?: Database["public"]["Enums"]["enum_status_inventario"] | null
          tipo_inventario?:
            | Database["public"]["Enums"]["enum_tipo_inventario"]
            | null
        }
        Relationships: []
      }
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
      vw_abastecimento_lista: {
        Row: {
          armazem_descricao: string | null
          armazem_id: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_login: string | null
          empresa_id: string | null
          finalizado_em: string | null
          id: string | null
          observacao: string | null
          status:
            | Database["public"]["Enums"]["enum_status_abastecimento"]
            | null
          tarefas_concluidas: number | null
          tarefas_vinculadas: number | null
          tenant_id: string | null
          tipo: Database["public"]["Enums"]["enum_tipo_abastecimento"] | null
          total_itens: number | null
          total_tarefas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "abastecimento_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_endereco_listagem: {
        Row: {
          apto: number | null
          armazem_descricao: string | null
          armazem_id: string | null
          ativo: boolean | null
          codigo_endereco: number | null
          curva_acesso: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string | null
          id: string | null
          lado: Database["public"]["Enums"]["enum_lado"] | null
          nivel: number | null
          predio: number | null
          rua: number | null
          setor_descricao: string | null
          setor_id: string | null
          situacao: Database["public"]["Enums"]["enum_situacao_endereco"] | null
          tenant_id: string | null
          tipo_endereco:
            | Database["public"]["Enums"]["enum_tipo_endereco"]
            | null
          tipo_estoque_descricao: string | null
          tipo_estoque_id: string | null
          tipo_estrutura:
            | Database["public"]["Enums"]["tipo_estrutura_armazem"]
            | null
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
          {
            foreignKeyName: "endereco_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_estoque_movimento_relatorio: {
        Row: {
          criado_em: string | null
          empresa_id: string | null
          endereco_destino: string | null
          endereco_origem: string | null
          hu_id: string | null
          id: string | null
          lote: string | null
          produto_descricao: string | null
          quantidade: number | null
          sku: string | null
          tarefa_execucao_id: string | null
          tarefa_execucao_status:
            | Database["public"]["Enums"]["enum_status_execucao_tarefa"]
            | null
          tarefa_usuario_id: string | null
          tarefa_usuario_nome: string | null
          tenant_id: string | null
          tipo_documento_origem: string | null
          tipo_movimento: number | null
          tipo_tarefa_codigo: string | null
          tipo_tarefa_descricao: string | null
          usuario_id: string | null
          usuario_nome: string | null
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
            foreignKeyName: "estoque_movimento_hu_id_fkey"
            columns: ["hu_id"]
            isOneToOne: false
            referencedRelation: "hu"
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
            referencedRelation: "vw_inventario_execucao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_tarefa_execucao_id_fkey"
            columns: ["tarefa_execucao_id"]
            isOneToOne: false
            referencedRelation: "vw_lms_timeline_operador"
            referencedColumns: ["execucao_id"]
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
            foreignKeyName: "estoque_movimento_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_movimento_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "execucao_tarefa_usuario_id_fkey"
            columns: ["tarefa_usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_inventario_execucao: {
        Row: {
          concluido_em: string | null
          endereco_descricao: string | null
          endereco_origem_id: string | null
          fabricacao: string | null
          hu: string | null
          hu_codigo: string | null
          id: string | null
          lote: string | null
          quantidade_executada: number | null
          tarefa_id: string | null
          tenant_id: string | null
          usuario_id: string | null
          usuario_login: string | null
          validade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucao_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "inventario_item_resumo"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "tarefa_execucao_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "endereco"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_endereco_origem_id_fkey"
            columns: ["endereco_origem_id"]
            isOneToOne: false
            referencedRelation: "vw_endereco_listagem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarefa_execucao_hu_fkey"
            columns: ["hu"]
            isOneToOne: false
            referencedRelation: "hu"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_inventario_lista: {
        Row: {
          acuracidade: number | null
          armazem_id: string | null
          criado_em: string | null
          criado_por: string | null
          criado_por_nome: string | null
          descricao: string | null
          empresa_id: string | null
          id: string | null
          numero_inventario: number | null
          observacao: string | null
          origem: Database["public"]["Enums"]["enum_origem_inventario"] | null
          status: Database["public"]["Enums"]["enum_status_inventario"] | null
          tenant_id: string | null
          tipo_execucao:
            | Database["public"]["Enums"]["enum_execucao_inventario"]
            | null
          tipo_inventario:
            | Database["public"]["Enums"]["enum_tipo_inventario"]
            | null
          total_divergencias: number | null
          total_itens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventario_armazem_fk"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_empresa_fk"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventario_usuario_criacao_fk"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_lms_timeline_operador: {
        Row: {
          armazem_id: string | null
          atribuido_em: string | null
          concluido_em: string | null
          criado_em: string | null
          duracao_segundos: number | null
          empresa_id: string | null
          espera_atribuicao_inicio: number | null
          espera_criacao_atribuicao: number | null
          execucao_id: string | null
          habilidade: Database["public"]["Enums"]["enum_habilidade"] | null
          id_documento_origem: string | null
          iniciado_em: string | null
          performance_pct: number | null
          quantidade_cortada: number | null
          quantidade_executada: number | null
          quantidade_requerida: number | null
          status:
            | Database["public"]["Enums"]["enum_status_execucao_tarefa"]
            | null
          tarefa_id: string | null
          tempo_estimado_segundos: number | null
          tenant_id: string | null
          tipo_documento_origem: string | null
          tipo_operacao:
            | Database["public"]["Enums"]["enum_tipo_operacao"]
            | null
          tipo_tarefa_codigo: string | null
          tipo_tarefa_descricao: string | null
          turno_descricao: string | null
          turno_fim: string | null
          turno_id: string | null
          turno_inicio: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucao_tarefa_tarefa_id_fkey"
            columns: ["tarefa_id"]
            isOneToOne: false
            referencedRelation: "inventario_item_resumo"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "execucao_tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            foreignKeyName: "usuario_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turnos"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "vw_movimento_entrada_info"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_lista"
            referencedColumns: ["id"]
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
          {
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      vw_movimento_entrada_docs_vinculados: {
        Row: {
          movimento_entrada_id: string | null
          numero_nota: string | null
          qtd_volume: number | null
          razaosocial: string | null
          tenant_id: string | null
          total_skus: number | null
          valor_total_nota: number | null
        }
        Relationships: [
          {
            foreignKeyName: "documento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            referencedRelation: "vw_movimento_entrada_info"
            referencedColumns: ["movimento_id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_lista"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_documento_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "vw_movimento_entrada_resumo"
            referencedColumns: ["movimento_id"]
          },
        ]
      }
      vw_movimento_entrada_info: {
        Row: {
          armazem_descricao: string | null
          box_descricao: string | null
          confirma_volume: boolean | null
          created_at: string | null
          crossdocking: boolean | null
          movimento_id: string | null
          numero_movimento: number | null
          observacao: string | null
          placa_veiculo: string | null
          status: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          tenant_id: string | null
          tipo_entrada_descricao: string | null
          tipo_entrada_id: string | null
          total_volume: number | null
          total_volume_conferido: number | null
          valor_descarga: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_tipo_entrada_id_fkey"
            columns: ["tipo_entrada_id"]
            isOneToOne: false
            referencedRelation: "tipo_entrada"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimento_entrada_lista: {
        Row: {
          armazem_id: string | null
          created_at: string | null
          empresa_id: string | null
          id: string | null
          numero_movimento: number | null
          parceiro_nome: string | null
          placa_veiculo: string | null
          status: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          tenant_id: string | null
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
            foreignKeyName: "movimento_entrada_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
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
            foreignKeyName: "movimento_entrada_tenant_fk"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "vw_movimento_saida_lista"
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
            referencedRelation: "vw_movimento_saida_lista"
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
          {
            foreignKeyName: "tarefa_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimento_saida_docs_vinculados: {
        Row: {
          data_emissao: string | null
          movimento_saida_id: string | null
          numero_pedido: number | null
          ordem: number | null
          parceiro: string | null
          tenant_id: string | null
          valor_pedido: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_doc_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_doc_saida_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
            referencedRelation: "vw_movimento_saida_lista"
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
            referencedRelation: "vw_movimento_saida_lista"
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
      vw_movimento_saida_lista: {
        Row: {
          box_id: string | null
          box_nome: string | null
          data_emissao: string | null
          destino_carga: string | null
          empresa_id: string | null
          id: string | null
          m3: number | null
          motorista: string | null
          numero_onda: number | null
          observacao: string | null
          parceiro_nome: string | null
          peso_total: number | null
          prioridade: Database["public"]["Enums"]["enum_prioridade_onda"] | null
          rota_id: string | null
          status:
            | Database["public"]["Enums"]["enum_status_onda_carregamento"]
            | null
          tenant_id: string | null
          total_pedidos: number | null
          total_volume: number | null
          veiculo_id: string | null
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
            foreignKeyName: "fk_onda_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
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
      vw_movimento_saida_resumo: {
        Row: {
          descricao: string | null
          movimento_id: string | null
          movimento_item_id: string | null
          produto_id: string | null
          qtd_conferida: number | null
          qtd_cortada: number | null
          qtd_esperada: number | null
          qtd_separada: number | null
          sku: string | null
          status: Database["public"]["Enums"]["enum_status_item_onda"] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_onda_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produto"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_onda_item_prod"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "vw_produto_listagem"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_movimento_saida_separacao_detalhe: {
        Row: {
          auto_separacao: boolean | null
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
      vw_produto_listagem: {
        Row: {
          ativo: boolean | null
          camada: number | null
          codigo_erp: string | null
          curva_acesso: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda: Database["public"]["Enums"]["enum_curva"] | null
          descricao: string | null
          dias_shelf: number | null
          empresa_id: string | null
          fator_caixa: number | null
          foto: string | null
          grupo_id: string | null
          id: string | null
          lastro: number | null
          marca: string | null
          parceiro_id: string | null
          peso_bruto: number | null
          peso_variavel: boolean | null
          preco_custo: number | null
          referencia: string | null
          shelf_devolucao: number | null
          shelf_entrada: number | null
          sku: string | null
          subgrupo_id: string | null
          tem_ean: boolean | null
          tenant_id: string | null
          tipo_controle:
            | Database["public"]["Enums"]["enum_tipo_controle"]
            | null
          tipo_separacao:
            | Database["public"]["Enums"]["enum_tipo_separacao"]
            | null
          tolerancia: number | null
          usa_picking: boolean | null
          varios_pickings: boolean | null
        }
        Insert: {
          ativo?: boolean | null
          camada?: number | null
          codigo_erp?: string | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda?: Database["public"]["Enums"]["enum_curva"] | null
          descricao?: string | null
          dias_shelf?: number | null
          empresa_id?: string | null
          fator_caixa?: number | null
          foto?: string | null
          grupo_id?: string | null
          id?: string | null
          lastro?: number | null
          marca?: string | null
          parceiro_id?: string | null
          peso_bruto?: number | null
          peso_variavel?: boolean | null
          preco_custo?: number | null
          referencia?: string | null
          shelf_devolucao?: number | null
          shelf_entrada?: number | null
          sku?: string | null
          subgrupo_id?: string | null
          tem_ean?: never
          tenant_id?: string | null
          tipo_controle?:
            | Database["public"]["Enums"]["enum_tipo_controle"]
            | null
          tipo_separacao?:
            | Database["public"]["Enums"]["enum_tipo_separacao"]
            | null
          tolerancia?: number | null
          usa_picking?: boolean | null
          varios_pickings?: boolean | null
        }
        Update: {
          ativo?: boolean | null
          camada?: number | null
          codigo_erp?: string | null
          curva_acesso?: Database["public"]["Enums"]["enum_curva"] | null
          curva_venda?: Database["public"]["Enums"]["enum_curva"] | null
          descricao?: string | null
          dias_shelf?: number | null
          empresa_id?: string | null
          fator_caixa?: number | null
          foto?: string | null
          grupo_id?: string | null
          id?: string | null
          lastro?: number | null
          marca?: string | null
          parceiro_id?: string | null
          peso_bruto?: number | null
          peso_variavel?: boolean | null
          preco_custo?: number | null
          referencia?: string | null
          shelf_devolucao?: number | null
          shelf_entrada?: number | null
          sku?: string | null
          subgrupo_id?: string | null
          tem_ean?: never
          tenant_id?: string | null
          tipo_controle?:
            | Database["public"]["Enums"]["enum_tipo_controle"]
            | null
          tipo_separacao?:
            | Database["public"]["Enums"]["enum_tipo_separacao"]
            | null
          tolerancia?: number | null
          usa_picking?: boolean | null
          varios_pickings?: boolean | null
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
          {
            foreignKeyName: "produto_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_tenant_resumo: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          id: string | null
          nome: string | null
          total_empresas: number | null
          total_entradas: number | null
          total_movimentos: number | null
          total_ondas: number | null
          total_produtos: number | null
          total_usuarios: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          total_empresas?: never
          total_entradas?: never
          total_movimentos?: never
          total_ondas?: never
          total_produtos?: never
          total_usuarios?: never
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          id?: string | null
          nome?: string | null
          total_empresas?: never
          total_entradas?: never
          total_movimentos?: never
          total_ondas?: never
          total_produtos?: never
          total_usuarios?: never
        }
        Relationships: []
      }
      vw_volume_expedicao_lista: {
        Row: {
          codigo_volume: string | null
          created_at: string | null
          destino_carga: string | null
          documento_saida_id: string | null
          empresa_id: string | null
          id: string | null
          m3: number | null
          motorista: string | null
          movimento_saida_id: string | null
          numero_onda: number | null
          parceiro_id: string | null
          parceiro_nome: string | null
          peso_bruto: number | null
          rota_id: string | null
          status: Database["public"]["Enums"]["enum_status_volume"] | null
          tenant_id: string | null
          total_volumes_movimento: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_doc_saida_parceiro"
            columns: ["parceiro_id"]
            isOneToOne: false
            referencedRelation: "parceiro"
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
            foreignKeyName: "volume_expedicao_documento_saida_id_fkey"
            columns: ["documento_saida_id"]
            isOneToOne: false
            referencedRelation: "documento_saida"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "vw_movimento_saida_lista"
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
          {
            foreignKeyName: "volume_expedicao_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "vw_tenant_resumo"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assert_tenant_match: { Args: { p_tenant_id: string }; Returns: undefined }
      assert_tenant_match_seed: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      atribuir_tarefa: {
        Args: {
          p_empresa_id: string
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      buscar_itens_movimento_entrada: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: {
          descricao: string
          id: string
          movimento_item_id: string
          qtd_armazenada: number
          qtd_conferida: number
          qtd_esperada: number
          qtd_ocorrencia: number
          sku: string
          status_item_movimento: string
        }[]
      }
      buscar_itens_onda_carregamento: {
        Args: { p_movimento_saida_id: string; p_tenant_id: string }
        Returns: {
          auto_separacao: boolean
          descricao: string
          id: string
          motivo_descricao: string
          movimento_item_id: string
          produto_id: string
          qtd_conferida: number
          qtd_cortada: number
          qtd_esperada: number
          qtd_separada: number
          sku: string
          status: string
        }[]
      }
      conferencia_buscar_ondas: {
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
      conferencia_buscar_tarefas: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: {
          conferido: number
          descricao: string
          fator_caixa: number
          id: string
          ordem_tarefa: number
          produto_id: string
          quantidade_requerida: number
          sku: string
          status: string
          tarefa_id: string
        }[]
      }
      conferencia_saida_confirmacao:
        | {
            Args: {
              p_quantidade: number
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_modo_conferencia?: string
              p_quantidade: number
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario_id: string
            }
            Returns: string
          }
      cortar_item_separacao:
        | {
            Args: {
              p_motivo_ocorrencia: string
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_motivo_ocorrencia: string
              p_observacao?: string
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario: string
            }
            Returns: Json
          }
      criar_movimento_saida_registro: {
        Args: {
          p_box_id?: string
          p_chave_agrupamento: string
          p_empresa_id: string
          p_prioridade: Database["public"]["Enums"]["enum_prioridade_onda"]
          p_rota_id?: string
          p_tenant_id: string
          p_tipo_saida_id: string
          p_veiculo_id?: string
        }
        Returns: string
      }
      cron_liberar_conferencia_automatica: { Args: never; Returns: Json }
      cron_liberar_separacao_automatica: { Args: never; Returns: Json }
      dashboard_kpis: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_ini?: string
          p_empresa_id?: string
          p_tenant_id: string
          p_turno_id?: string
        }
        Returns: Json
      }
      dashboard_ocorrencias: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_ini?: string
          p_empresa_id?: string
          p_limite?: number
          p_tenant_id: string
        }
        Returns: Json
      }
      dashboard_operadores_ativos: {
        Args: {
          p_armazem_id?: string
          p_empresa_id?: string
          p_tenant_id: string
        }
        Returns: Json
      }
      dashboard_ranking_operadores: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_ini?: string
          p_empresa_id?: string
          p_limite?: number
          p_tenant_id: string
          p_turno_id?: string
        }
        Returns: {
          nome: string
          produtividade: number
          tarefas: number
          tempo_medio_seg: number
          usuario_id: string
        }[]
      }
      dashboard_tarefas_ativas: {
        Args: {
          p_armazem_id?: string
          p_empresa_id?: string
          p_limite?: number
          p_tenant_id: string
        }
        Returns: Json
      }
      dashboard_tendencia_tarefas: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_ini?: string
          p_empresa_id?: string
          p_tenant_id: string
          p_turno_id?: string
        }
        Returns: {
          hora: number
          tarefas: number
          unidades: number
        }[]
      }
      entrada_conferencia_buscar_tarefas: {
        Args: {
          p_empresa_id: string
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: {
          conferido: number
          descricao: string
          fator_caixa: number
          id: string
          ordem_tarefa: number
          quantidade_requerida: number
          sku: string
          status: string
        }[]
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
          p_tenant_id: string
          p_usuario: string
          p_validade: string
        }
        Returns: string
      }
      finalizar_conferencia_entrada_item: {
        Args: {
          p_fabricacao: string
          p_hu: string
          p_lote: string
          p_quantidade: number
          p_tarefa_id: string
          p_usuario: string
          p_validade: string
        }
        Returns: string
      }
      finalizar_conferencia_entrada_movimento: {
        Args: {
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario: string
        }
        Returns: string
      }
      fn_buscar_dados_armazenagem: {
        Args: { p_ean: string; p_empresa_ids: string[]; p_tenant_id: string }
        Returns: {
          descricao: string
          enderecos_picking: string
          fabricacao: string
          lote: string
          produto_id: string
          qtd_a_armazenar: number
          qtd_armazenada: number
          qtd_conferida: number
          sku: string
          tarefa_id: string
          validade: string
          varios_pickings: string
        }[]
      }
      fn_buscar_dados_armazenagem_: {
        Args: { p_ean: string; p_empresa_ids: string[]; p_tenant_id: string }
        Returns: {
          descricao: string
          enderecos_picking: string
          fabricacao: string
          lote: string
          produto_id: string
          qtd_a_armazenar: number
          qtd_armazenada: number
          qtd_conferida: number
          sku: string
          tarefa_id: string
          validade: string
          varios_pickings: string
        }[]
      }
      fn_buscar_email_por_login: {
        Args: { p_login: string; p_tenant_id?: string }
        Returns: string
      }
      fn_cancelar_movimento_entrada: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: Json
      }
      fn_cancelar_onda_carregamento: {
        Args: { p_movimento_saida_id: string; p_tenant_id: string }
        Returns: Json
      }
      fn_coletor_menu_badges: {
        Args: {
          p_armazem_id?: string
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_conferencia_buscar_produto_por_barcode: {
        Args: {
          p_codigo_barras: string
          p_movimento_entrada_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_consolidar_lms_diario: { Args: { p_data?: string }; Returns: Json }
      fn_criar_inventario: {
        Args: {
          p_armazem_id: string
          p_chunk_size?: number
          p_descricao: string
          p_empresa_id: string
          p_endereco_id?: string
          p_grupo_produto_id?: string
          p_inventario_id?: string
          p_produto_id?: string
          p_tenant_id: string
          p_tipo_execucao: Database["public"]["Enums"]["enum_execucao_inventario"]
          p_tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
          p_usuario_id: string
          p_zona_atividade_id?: string
        }
        Returns: Json
      }
      fn_criar_inventario_v2:
        | {
            Args: {
              p_armazem_id: string
              p_bloquear_movimentacao?: boolean
              p_criterio_selecao?: Database["public"]["Enums"]["enum_criterio_selecao_inventario"]
              p_curva?: Database["public"]["Enums"]["enum_curva"]
              p_data_planejada?: string
              p_descricao: string
              p_empresa_id: string
              p_endereco_id?: string
              p_grupo_produto_id?: string
              p_max_enderecos_dia?: number
              p_priorizar_picking?: boolean
              p_produto_id?: string
              p_tenant_id: string
              p_tipo_execucao: Database["public"]["Enums"]["enum_execucao_inventario"]
              p_tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
              p_usuario_id: string
              p_zona_atividade_id?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_armazem_id: string
              p_bloquear_movimentacao?: boolean
              p_criterio_selecao?: Database["public"]["Enums"]["enum_criterio_selecao_inventario"]
              p_curva?: Database["public"]["Enums"]["enum_curva"]
              p_data_fim_analise?: string
              p_data_inicio_analise?: string
              p_data_planejada?: string
              p_descricao: string
              p_empresa_id: string
              p_endereco_id?: string
              p_grupo_produto_id?: string
              p_max_enderecos_dia?: number
              p_priorizar_picking?: boolean
              p_produto_id?: string
              p_tenant_id: string
              p_tipo_execucao: Database["public"]["Enums"]["enum_execucao_inventario"]
              p_tipo_inventario: Database["public"]["Enums"]["enum_tipo_inventario"]
              p_usuario_id: string
              p_zona_atividade_id?: string
            }
            Returns: Json
          }
      fn_excluir_volume_expedicao: {
        Args: {
          p_observacao?: string
          p_usuario_id: string
          p_volume_id: string
        }
        Returns: Json
      }
      fn_gerar_abastecimento: {
        Args: {
          p_armazem_id: string
          p_empresa_id: string
          p_itens?: Json
          p_simular?: boolean
          p_tenant_id: string
          p_tipo: string
          p_usuario_id: string
        }
        Returns: Json
      }
      fn_gerar_abastecimento_old: {
        Args: {
          p_armazem_id: string
          p_empresa_id: string
          p_simular?: boolean
          p_tenant_id: string
          p_tipo: string
          p_usuario_id: string
        }
        Returns: Json
      }
      fn_gerar_conferencia_saida: {
        Args: { p_movimento_saida_id: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_gerar_tarefas_inventario: {
        Args: {
          p_chunk_size?: number
          p_inventario_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_gme_analisar_documentos: {
        Args: { p_documento_entrada_ids: string[]; p_tenant_id: string }
        Returns: Record<string, unknown>
      }
      fn_gme_criar_manual: {
        Args: {
          p_armazem_id: string
          p_box_id: string
          p_confirma_volume: boolean
          p_crossdocking: boolean
          p_documento_entrada_ids: string[]
          p_observacao: string
          p_placa_veiculo: string
          p_tenant_id: string
          p_usuario_id: string
          p_valor_descarga: number
        }
        Returns: Json
      }
      fn_gme_persistir_movimento: {
        Args: {
          p_armazem_id: string
          p_box_id: string
          p_confirma_volume: boolean
          p_crossdocking: boolean
          p_documento_entrada_ids: string[]
          p_empresa_id: string
          p_observacao: string
          p_placa_veiculo: string
          p_tenant_id: string
          p_tipo_entrada_id: string
          p_total_volume: number
          p_usuario_id: string
          p_valor_descarga: number
        }
        Returns: Record<string, unknown>
      }
      fn_gme_processar_automatico: {
        Args: { p_tenant_id: string; p_usuario_id: string }
        Returns: Json
      }
      fn_gme_validar_box: {
        Args: { p_armazem_id: string; p_box_id: string; p_tenant_id: string }
        Returns: undefined
      }
      fn_inventario_buscar_tarefas: {
        Args: {
          p_contagem_inventario: number
          p_empresa_id: string
          p_inventario_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: {
          conferido: number
          descricao: string
          fator_caixa: number
          id: string
          id_local_origem: string
          ordem_tarefa: number
          produto_id: string
          quantidade_requerida: number
          sku: string
          status: string
        }[]
      }
      fn_inventario_cobertura: {
        Args: { p_inventario_id: string; p_tenant_id: string }
        Returns: Json
      }
      fn_inventario_contagem_livre:
        | {
            Args: {
              p_ean: string
              p_endereco_codigo: number
              p_inventario_id: string
              p_quantidade: number
              p_tenant_id: string
              p_usuario_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_ean: string
              p_endereco_codigo: number
              p_fabricacao?: string
              p_inventario_id: string
              p_lote?: string
              p_quantidade: number
              p_tenant_id: string
              p_usuario_id: string
              p_validade?: string
            }
            Returns: Json
          }
      fn_inventario_finalizar_conferencia_endereco: {
        Args: {
          p_endereco_origem_id: string
          p_fabricacao: string
          p_hu: string
          p_lote: string
          p_quantidade: number
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario: string
          p_validade: string
        }
        Returns: string
      }
      fn_inventario_finalizar_geral: {
        Args: {
          p_inventario_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      fn_inventario_registrar_contagem: {
        Args: {
          p_contagem: number
          p_endereco_origem_id?: string
          p_fabricacao?: string
          p_hu?: string
          p_lote?: string
          p_quantidade: number
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario: string
          p_validade?: string
        }
        Returns: string
      }
      fn_liberar_armz_carregar_contexto: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: Record<string, unknown>
      }
      fn_liberar_armz_concluir_conferencia: {
        Args: {
          p_item_ids: string[]
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_tipo_tarefa_armz_id: string
        }
        Returns: number
      }
      fn_liberar_armz_contar_itens: {
        Args: { p_movimento_entrada_id: string; p_tenant_id: string }
        Returns: Record<string, unknown>
      }
      fn_liberar_armz_criar_tarefas: {
        Args: {
          p_armazem_id: string
          p_automatica: boolean
          p_empresa_id: string
          p_endereco_auto_id: string
          p_item_ids: string[]
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_tipo_tarefa_armz_id: string
          p_usuario_id: string
        }
        Returns: number
      }
      fn_liberar_armz_executar_automatica: {
        Args: {
          p_endereco_auto_id: string
          p_item_ids: string[]
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_tipo_tarefa_armz_id: string
          p_usuario_id: string
        }
        Returns: number
      }
      fn_liberar_armz_finalizar_automatico: {
        Args: {
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      fn_liberar_armz_finalizar_manual: {
        Args: {
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: string
      }
      fn_liberar_armz_normalizar_divergentes: {
        Args: { p_itens_divergentes: Json }
        Returns: Json
      }
      fn_liberar_armz_processar_divergentes: {
        Args: {
          p_armazem_id: string
          p_divergentes: Json
          p_empresa_id: string
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: number
      }
      fn_limpar_conferencia_entrada: {
        Args: {
          p_quantidade: number
          p_tarefa_execucao_id: string
          p_tarefa_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      fn_pme_atualizar_situacao_endereco: {
        Args: {
          p_endereco_destino_id: string
          p_endereco_origem_id: string
          p_tenant_id: string
          p_tipo_movimento: number
        }
        Returns: undefined
      }
      fn_pme_baixar_estoque_origem: {
        Args: {
          p_empresa_id: string
          p_endereco_origem_id: string
          p_fabricacao: string
          p_hu_id: string
          p_lote: string
          p_produto_id: string
          p_quantidade: number
          p_tenant_id: string
          p_validade: string
        }
        Returns: undefined
      }
      fn_pme_capturar_saldos_anteriores: {
        Args: {
          p_empresa_id: string
          p_endereco_destino_id: string
          p_endereco_origem_id: string
          p_produto_id: string
          p_tenant_id: string
          p_tipo_movimento: number
        }
        Returns: Record<string, unknown>
      }
      fn_pme_carregar_execucao: {
        Args: { p_tarefa_execucao_id: string }
        Returns: Record<string, unknown>
      }
      fn_pme_creditar_estoque_destino: {
        Args: {
          p_empresa_id: string
          p_endereco_destino_id: string
          p_fabricacao: string
          p_hu_id: string
          p_lote: string
          p_produto_id: string
          p_quantidade: number
          p_tenant_id: string
          p_validade: string
        }
        Returns: undefined
      }
      fn_pme_processar_inventario: {
        Args: {
          p_empresa_id: string
          p_endereco_origem_id: string
          p_fabricacao: string
          p_hu_id: string
          p_id_documento_origem: string
          p_lote: string
          p_produto_id: string
          p_tarefa_id: string
          p_te_id: string
          p_tenant_id: string
          p_tipo_documento_origem: string
          p_tipo_movimento: number
          p_usuario_id: string
          p_validade: string
        }
        Returns: undefined
      }
      fn_pme_processar_normal: {
        Args: {
          p_empresa_id: string
          p_endereco_destino_id: string
          p_endereco_origem_id: string
          p_fabricacao: string
          p_hu_id: string
          p_id_documento_origem: string
          p_lote: string
          p_produto_id: string
          p_quantidade: number
          p_te_id: string
          p_tenant_id: string
          p_tipo_documento_origem: string
          p_tipo_movimento: number
          p_usuario_id: string
          p_validade: string
        }
        Returns: undefined
      }
      fn_resolve_tenant_by_slug: {
        Args: { p_slug: string }
        Returns: {
          ativo: boolean
          id: string
          nome: string
          slug: string
        }[]
      }
      fn_seed_rbac_para_tenant: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      fn_separacao_automatica_pdv: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_tenant_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["resultado_separacao_pdv"]
        SetofOptions: {
          from: "*"
          to: "resultado_separacao_pdv"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_user_belongs_to_tenant: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      fn_usuario_permissoes: {
        Args: { p_usuario_id: string }
        Returns: {
          acao: string
          modulo_codigo: string
        }[]
      }
      fn_usuario_tem_empresa: {
        Args: { p_empresa_id: string }
        Returns: boolean
      }
      fn_usuario_tem_permissao: {
        Args: { p_acao: string; p_modulo_codigo: string; p_usuario_id: string }
        Returns: boolean
      }
      fn_usuario_tenant: { Args: never; Returns: string }
      gerar_movimento_entrada: {
        Args: {
          p_armazem_id?: string
          p_box_id?: string
          p_confirma_volume?: boolean
          p_crossdocking?: boolean
          p_documento_entrada_ids?: string[]
          p_modo?: string
          p_observacao?: string
          p_placa_veiculo?: string
          p_tenant_id: string
          p_usuario_id: string
          p_valor_descarga?: number
        }
        Returns: Json
      }
      gerar_onda_separacao: {
        Args: {
          p_box_id?: string
          p_documentos?: string[]
          p_empresa_id: string
          p_modo?: string
          p_prioridade?: Database["public"]["Enums"]["enum_prioridade_onda"]
          p_rota_id?: string
          p_tenant_id: string
          p_usuario_id: string
          p_veiculo_id?: string
        }
        Returns: Json
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
        Args: {
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      gerar_volumes_expedicao: {
        Args: {
          p_empresa_id: string
          p_etapa_origem?: string
          p_movimento_saida_id: string
          p_quantidade_volumes: number
          p_tenant_id: string
        }
        Returns: Json
      }
      get_current_tenant: { Args: never; Returns: string }
      get_my_tenant_id: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      hu_padrao: { Args: never; Returns: string }
      integracao_atualizar_teste: {
        Args: {
          p_empresa_id: string
          p_erp_provedor_id: string
          p_erro?: string
          p_tenant_id: string
          p_teste_ok: boolean
        }
        Returns: undefined
      }
      integracao_get_credenciais: {
        Args: {
          p_empresa_id: string
          p_erp_provedor_id?: string
          p_tenant_id: string
        }
        Returns: {
          conexao_id: string
          config_extra: Json
          credenciais: Json
          erp_provedor_id: string
          tipo_integracao: string
        }[]
      }
      integracao_get_id_interno: {
        Args: {
          p_empresa_id: string
          p_entidade: string
          p_erp_provedor_id?: string
          p_id_externo: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_get_sync_configs: {
        Args: {
          p_empresa_id?: string
          p_entidade: string
          p_modulo: string
          p_tenant_id?: string
        }
        Returns: {
          config_extra: Json
          config_id: string
          credenciais: Json
          cursor_state: Json
          empresa_id: string
          erp_provedor_id: string
          intervalo_minutos: number
          tenant_id: string
          ultimo_sync_em: string
        }[]
      }
      integracao_listar_fila: {
        Args: {
          p_direcao?: string
          p_empresa_id: string
          p_limite?: number
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          criado_em: string
          entidade: string
          erp_provedor_id: string
          id: string
          id_externo: string
          max_tentativas: number
          mensagem_erro: string
          processado_em: string
          processar_apos: string
          status: string
          tentativas: number
        }[]
      }
      integracao_listar_logs: {
        Args: {
          p_empresa_id: string
          p_entidade?: string
          p_erp_provedor_id?: string
          p_limite?: number
          p_offset?: number
          p_status?: string
          p_tenant_id: string
        }
        Returns: {
          criado_em: string
          direcao: string
          disparado_por: string
          duracao_ms: number
          entidade: string
          erp_provedor_id: string
          id: string
          id_chamada: string
          mensagem_erro: string
          modulo: string
          operacao: string
          registros_atualizados: number
          registros_buscados: number
          registros_erro: number
          registros_inseridos: number
          status: string
        }[]
      }
      integracao_listar_provedores: {
        Args: never
        Returns: {
          disponivel: boolean
          esquema_credencial: Json
          id: string
          nome: string
          ordem: number
          tipo: string
        }[]
      }
      integracao_log_sync: {
        Args: {
          p_atualizados?: number
          p_buscados?: number
          p_disparado_por?: string
          p_duracao_ms?: number
          p_empresa_id: string
          p_entidade: string
          p_erp_provedor_id: string
          p_erros?: number
          p_id_chamada?: string
          p_inseridos?: number
          p_mensagem_erro?: string
          p_modulo: string
          p_operacao?: string
          p_payload_amostra?: Json
          p_status?: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_resetar_cursor: {
        Args: { p_empresa_id: string; p_entidade: string; p_tenant_id: string }
        Returns: undefined
      }
      integracao_resolver_webhook: {
        Args: { p_webhook_secret: string }
        Returns: {
          conexao_id: string
          config_extra: Json
          credenciais: Json
          empresa_id: string
          erp_provedor_id: string
          tenant_id: string
        }[]
      }
      integracao_resumo_sync_hoje: {
        Args: { p_empresa_id: string; p_tenant_id: string }
        Returns: {
          registros_atualizados_hoje: number
          registros_erro_hoje: number
          registros_inseridos_hoje: number
          total_erro: number
          total_parcial: number
          total_sucesso: number
          total_syncs: number
          ultima_entidade: string
          ultimo_status: string
          ultimo_sync_em: string
        }[]
      }
      integracao_salvar_conexao: {
        Args: {
          p_ativo?: boolean
          p_config_extra?: Json
          p_credenciais: Json
          p_empresa_id: string
          p_erp_provedor_id: string
          p_tenant_id: string
          p_tipo_integracao?: string
          p_usuario_id?: string
        }
        Returns: string
      }
      integracao_save_cursor: {
        Args: {
          p_concluido?: boolean
          p_cursor: Json
          p_empresa_id: string
          p_entidade: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      integracao_upsert_documento_entrada: {
        Args: {
          p_chave_nfe: string
          p_codigo_erp: string
          p_data_emissao: string
          p_data_entrada: string
          p_empresa_id: string
          p_numero_nota: string
          p_parceiro_id: string
          p_qtd_volume: number
          p_status: number
          p_tenant_id: string
          p_tipo_entrada_id: string
          p_valor_total_nota: number
          p_valor_total_prod: number
        }
        Returns: string
      }
      integracao_upsert_documento_entrada_item: {
        Args: {
          p_documento_entrada_id: string
          p_produto_id: string
          p_quantidade: number
          p_tenant_id: string
          p_valor_total: number
          p_valor_unidade: number
        }
        Returns: string
      }
      integracao_upsert_documento_entrada_item_lote: {
        Args: {
          p_documento_entrada_item_id: string
          p_fabricacao: string
          p_lote: string
          p_quantidade: number
          p_serie?: string
          p_tenant_id: string
          p_validade: string
        }
        Returns: string
      }
      integracao_upsert_documento_saida: {
        Args: {
          p_codigo_erp: string
          p_data_emissao: string
          p_empresa_id: string
          p_numero_pedido: number
          p_observacao: string
          p_parceiro_id: string
          p_rota_id: string
          p_status: number
          p_tenant_id: string
          p_tipo_pedido_id: string
          p_transportador: string
          p_valor_pedido: number
        }
        Returns: string
      }
      integracao_upsert_documento_saida_item: {
        Args: {
          p_documento_saida_id: string
          p_produto_id: string
          p_quantidade: number
          p_tenant_id: string
          p_valor_total: number
          p_valor_unit: number
        }
        Returns: string
      }
      integracao_upsert_documento_saida_item_lote: {
        Args: {
          p_documento_saida_item_id: string
          p_fabricacao: string
          p_lote: string
          p_quantidade: number
          p_serie?: string
          p_tenant_id: string
          p_validade: string
        }
        Returns: string
      }
      integracao_upsert_embalagem: {
        Args: {
          p_altura: number
          p_ativo: boolean
          p_codigo_erp: string
          p_comprimento: number
          p_ean: string
          p_embalagem: string
          p_empresa_id: string
          p_fator: number
          p_largura: number
          p_peso_bruto: number
          p_peso_liq: number
          p_produto_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_grupo_produto: {
        Args: {
          p_ativo?: boolean
          p_codigo_erp: string
          p_descricao: string
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_id_map: {
        Args: {
          p_codigo_externo?: string
          p_empresa_id: string
          p_entidade: string
          p_erp_provedor_id: string
          p_id_externo: string
          p_id_interno: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      integracao_upsert_parceiro: {
        Args: {
          p_ativo: boolean
          p_bairro: string
          p_cep: string
          p_cidade: string
          p_cnpj: string
          p_codigo_erp: string
          p_complemento: string
          p_email: string
          p_empresa_id: string
          p_endereco: string
          p_estado: string
          p_nome_fantasia: string
          p_numero: string
          p_razao_social: string
          p_rota_id?: string
          p_telefone: string
          p_tenant_id: string
          p_tipo_parceiro: string
        }
        Returns: string
      }
      integracao_upsert_produto: {
        Args: {
          p_ativo: boolean
          p_codigo_erp: string
          p_descricao: string
          p_empresa_id: string
          p_grupo_id?: string
          p_marca: string
          p_parceiro_id: string
          p_peso_variavel: boolean
          p_preco_custo: number
          p_referencia: string
          p_sku: string
          p_tenant_id: string
          p_tipo_controle: string
          p_tipo_separacao: string
          p_usa_picking: boolean
          p_varios_pickings: boolean
        }
        Returns: {
          inserido: boolean
          produto_id: string
        }[]
      }
      integracao_upsert_rota: {
        Args: {
          p_armazem_id: string
          p_ativo?: boolean
          p_codigo_erp: string
          p_descricao: string
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_subgrupo_produto: {
        Args: {
          p_ativo?: boolean
          p_codigo_erp: string
          p_descricao: string
          p_empresa_id: string
          p_grupo_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_sync_config: {
        Args: {
          p_ativo?: boolean
          p_cursor_state?: Json
          p_direcao?: string
          p_empresa_id: string
          p_entidade: string
          p_erp_conexao_id?: string
          p_estrategia?: string
          p_intervalo_minutos?: number
          p_modulo: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_tipo_entrada: {
        Args: {
          p_ativo?: boolean
          p_codigo_erp: string
          p_descricao: string
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: string
      }
      integracao_upsert_tipo_saida: {
        Args: {
          p_ativo?: boolean
          p_codigo_erp: string
          p_conferencia_checkout?: boolean
          p_descricao: string
          p_empresa_id: string
          p_realiza_conferencia?: boolean
          p_separa_pulmao?: boolean
          p_tenant_id: string
        }
        Returns: string
      }
      is_platform_support: {
        Args: { p_auth_user_id: string }
        Returns: boolean
      }
      liberar_armazenagem: {
        Args: {
          p_item_ids?: string[]
          p_itens_divergentes?: Json
          p_modo?: string
          p_movimento_entrada_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      liberar_onda_separacao: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      liberar_recebimento_erro_transporte: {
        Args: {
          p_motivo_ocorrencia_id: string
          p_movimento_entrada_id: string
          p_observacao?: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: Json
      }
      listar_movimentos_entrada: {
        Args: {
          p_box_id?: string
          p_data_ate?: string
          p_data_de?: string
          p_empresa_id?: string
          p_numero_movimento?: number
          p_numero_nf?: string
          p_page?: number
          p_page_size?: number
          p_parceiro_codigo_erp?: string
          p_placa_veiculo?: string
          p_status?: string
          p_tenant_id: string
          p_tipo_entrada_id?: string
        }
        Returns: {
          box_descricao: string
          created_at: string
          id: string
          numero_movimento: number
          operador_nome: string
          parceiro_nome: string
          status: string
          tipo_entrada_descricao: string
          total_armazenado: number
          total_conferido: number
          total_esperado: number
          total_itens: number
          total_registros: number
        }[]
      }
      listar_ondas_carregamento: {
        Args: {
          p_data_ate?: string
          p_data_de?: string
          p_empresa_id?: string
          p_numero_documento?: number
          p_numero_onda?: number
          p_page?: number
          p_page_size?: number
          p_parceiro_codigo_erp?: string
          p_status?: string
          p_tenant_id: string
          p_tipo_saida_id?: string
          p_transportador?: string
          p_vendedor?: string
        }
        Returns: {
          box_descricao: string
          data_emissao: string
          id: string
          motorista: string
          numero_onda: number
          operador_nome: string
          parceiro_nome: string
          prioridade: string
          rota_descricao: string
          status: string
          total_conferido: number
          total_cortado: number
          total_esperado: number
          total_itens: number
          total_pedidos: number
          total_registros: number
          total_separado: number
          veiculo_placa: string
        }[]
      }
      preparar_dados_agrupamento: {
        Args: {
          p_documentos: string[]
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      processar_movimento_estoque: {
        Args: { p_tarefa_execucao_id: string }
        Returns: undefined
      }
      registrar_ocorrencia_operacional: {
        Args: {
          p_armazem_id: string
          p_categoria?: string
          p_documento_origem_id?: string
          p_empresa_id: string
          p_endereco_id?: string
          p_etapa_ocorrencia: string
          p_lote?: string
          p_motivo_ocorrencia_id?: string
          p_observacao?: string
          p_prioridade?: string
          p_produto_id?: string
          p_quantidade_esperada?: number
          p_quantidade_real?: number
          p_tarefa_execucao_id?: string
          p_tarefa_id?: string
          p_tenant_id: string
          p_tipo_documento_origem?: string
          p_tipo_ocorrencia: string
          p_usuario_causador_id?: string
          p_usuario_criador_id?: string
          p_validade?: string
        }
        Returns: Json
      }
      resolver_etiqueta_template: {
        Args: { p_empresa_id?: string; p_tipo: string }
        Returns: {
          ativo: boolean
          campos: Json
          com_cabecalho: boolean
          com_logo: boolean
          created_at: string
          created_by: string | null
          empresa_id: string | null
          id: string
          logo_url: string | null
          nome: string
          orientacao: string
          tamanho: string
          tenant_id: string
          tipo: string
          updated_at: string
          updated_by: string | null
          versao: number
        }[]
        SetofOptions: {
          from: "*"
          to: "etiqueta_template"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      rpc_coletor_abastecimento_confirmar_coleta: {
        Args: {
          p_empresa_id: string
          p_endereco_origem_id: string
          p_quantidade: number
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: string
      }
      rpc_coletor_abastecimento_confirmar_entrega: {
        Args: {
          p_empresa_id: string
          p_endereco_destino_id: string
          p_quantidade: number
          p_tarefa_execucao_id: string
          p_tarefa_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: string
      }
      rpc_coletor_abastecimento_listar_tarefas: {
        Args: { p_empresa_id: string; p_tenant_id: string }
        Returns: {
          coleta_pendente: boolean
          criado_em: string
          descricao: string
          destino_apto: number
          destino_nivel: number
          destino_predio: number
          destino_rua: number
          endereco_destino_desc: string
          endereco_destino_id: string
          endereco_origem_desc: string
          endereco_origem_id: string
          origem_apto: number
          origem_nivel: number
          origem_predio: number
          origem_rua: number
          prioridade_tarefa: string
          produto_id: string
          qtd_coletada: number
          qtd_restante: number
          quantidade_executada: number
          quantidade_requerida: number
          referencia: string
          saldo_origem: number
          sku: string
          status_tarefa: string
          tarefa_execucao_id: string
          tarefa_id: string
        }[]
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
      rpc_coletor_armazenagem_itens_movimento: {
        Args: {
          p_empresa_id: string
          p_movimento_entrada_id: string
          p_tenant_id: string
        }
        Returns: {
          descricao: string
          fabricacao: string
          lote: string
          movimento_entrada_item_id: string
          picking_apto: number
          picking_endereco_desc: string
          picking_endereco_id: string
          picking_est_maximo: number
          picking_est_minimo: number
          picking_nivel: number
          picking_ok: boolean
          picking_predio: number
          picking_rua: number
          produto_id: string
          qtd_restante: number
          quantidade_executada: number
          quantidade_requerida: number
          referencia: string
          saldo_picking: number
          sku: string
          tarefa_id: string
          validade: string
          varios_pickings: boolean
        }[]
      }
      rpc_coletor_armazenagem_listar_movimentos: {
        Args: { p_empresa_id: string; p_tenant_id: string }
        Returns: {
          box_descricao: string
          created_at: string
          itens_armazenados: number
          itens_pendentes: number
          movimento_entrada_id: string
          numero_movimento: number
          percentual_concluido: number
          qtd_total_executada: number
          qtd_total_requerida: number
          status_movimento: string
          total_itens: number
        }[]
      }
      rpc_historico_movimento_com_saldo: {
        Args: {
          p_data_fim: string
          p_data_inicio: string
          p_empresa_id: string
          p_sku?: string
          p_tenant_id: string
          p_tipo_mov?: number
        }
        Returns: {
          criado_em: string
          endereco_destino: string
          endereco_origem: string
          hu_id: string
          id: string
          lote: string
          produto_descricao: string
          quantidade: number
          saldo_anterior_destino: number
          saldo_anterior_origem: number
          saldo_final: number
          saldo_inicial: number
          saldo_posterior_destino: number
          saldo_posterior_origem: number
          sku: string
          tarefa_execucao_id: string
          tarefa_execucao_status: string
          tipo_documento_origem: string
          tipo_movimento: number
          tipo_tarefa_codigo: string
          tipo_tarefa_descricao: string
          usuario_nome: string
        }[]
      }
      rpc_relatorio_ciclo_pedido: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_inicio?: string
          p_empresa_id?: string
          p_prioridade?: string
          p_sla_horas?: number
          p_status_onda?: string
          p_tenant_id: string
        }
        Returns: {
          box_id: string
          cliente: string
          movimento_saida_id: string
          numero_onda: number
          parceiro_id: string
          pedidos: string
          perc_sla: number
          prioridade: string
          sla_horas: number
          status_onda: string
          status_sla: string
          t0_criacao: string
          t1_liberado: string
          t2_inicio_sep: string
          t3_fim_sep: string
          t4_fim_conf: string
          t4_inicio_conf: string
          t5_expedicao: string
          tempo_conferencia_min: number
          tempo_fila_min: number
          tempo_ocioso_min: number
          tempo_picking_min: number
          tempo_pos_conf_min: number
          tempo_total_min: number
        }[]
      }
      rpc_relatorio_dock_to_stock: {
        Args: {
          p_armazem_id?: string
          p_data_fim?: string
          p_data_inicio?: string
          p_empresa_id?: string
          p_sla_horas?: number
          p_tenant_id: string
        }
        Returns: {
          documento: string
          fornecedor: string
          movimento_entrada_id: string
          numero_movimento: number
          parceiro_id: string
          perc_sla: number
          sla_horas: number
          status_movimento: string
          status_sla: string
          t0_dock: string
          t1_autorizado: string
          t2_conf_inicio: string
          t3_conf_fim: string
          t4_armz_inicio: string
          t5_stock: string
          tempo_armazenagem_min: number
          tempo_conferencia_min: number
          tempo_liberacao_min: number
          tempo_ocioso_min: number
          tempo_total_min: number
          total_volume: number
        }[]
      }
      rpc_relatorio_tarefas_colaborador: {
        Args: {
          p_armazem_id?: string
          p_data_fim: string
          p_data_inicio: string
          p_empresa_id?: string
          p_status?: string
          p_tenant_id: string
          p_tipo_tarefa_id?: string
          p_usuario_id?: string
        }
        Returns: {
          armazem_id: string
          atribuido_em: string
          concluido_em: string
          documento_origem_id: string
          documento_origem_tipo: string
          duracao_segundos: number
          empresa_id: string
          endereco_destino: string
          endereco_origem: string
          espera_segundos: number
          execucao_id: string
          iniciado_em: string
          lote: string
          produto_descricao: string
          produto_sku: string
          quantidade_cortada: number
          quantidade_executada: number
          quantidade_requerida: number
          status_execucao: string
          tarefa_id: string
          tempo_estimado_seg: number
          tipo_tarefa_codigo: string
          tipo_tarefa_descricao: string
          usuario_id: string
          usuario_nome: string
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
          endereco_id: string
          fator_caixa: number
          ordem_tarefa: number
          produto: string
          quantidade_requerida: number
          saldo_endereco: number
          separado: number
          setor: string
          sku: string
          status: string
          tarefa_id: string
        }[]
      }
      separacao_conferencia_limpar_item: {
        Args: {
          p_movimento_saida_id: string
          p_produto_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      separacao_confirmar_endereco: {
        Args: {
          p_endereco_lido: string
          p_tarefa_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      separacao_executar_coleta:
        | {
            Args: {
              p_endereco_id: string
              p_quantidade: number
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_endereco_id: string
              p_fabricacao: string
              p_hu: string
              p_lote: string
              p_quantidade: number
              p_tarefa_id: string
              p_tenant_id: string
              p_usuario_id: string
              p_validade: string
            }
            Returns: string
          }
      separacao_limpar_item: {
        Args: {
          p_empresa_id: string
          p_movimento_saida_id: string
          p_produto_id: string
          p_tenant_id: string
          p_usuario_id: string
        }
        Returns: undefined
      }
      user_has_empresa_access: {
        Args: { _empresa: string; _tenant: string }
        Returns: boolean
      }
      validar_documentos_onda: {
        Args: {
          p_documentos: string[]
          p_empresa_id: string
          p_tenant_id: string
        }
        Returns: Database["public"]["CompositeTypes"]["resultado_validacao_docs_onda"]
        SetofOptions: {
          from: "*"
          to: "resultado_validacao_docs_onda"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      enum_acao_permissao: "CREATE" | "READ" | "UPDATE" | "DELETE" | "EXECUTE"
      enum_agrupar_conf_por: "DOCUMENTO" | "HU" | "BOX" | "ROTA"
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
      enum_ambiente_modulo: "WEB" | "COLETOR" | "AMBOS"
      enum_categoria_ocorrencia: "PREVENTIVA" | "CORRETIVA"
      enum_criterio_selecao_inventario:
        | "CURVA_VENDAS"
        | "CURVA_ACESSO"
        | "CORTES"
        | "ESTORNOS"
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
        | "INVENTARIO"
        | "AUDITORIA"
      enum_execucao_inventario: "AUDITORIA" | "ATUALIZACAO"
      enum_habilidade: "TREINANDO" | "BASICO" | "BOM" | "ESPECIALISTA"
      enum_lado: "PAR" | "IMPAR"
      enum_momento_geracao_volume:
        | "NENHUMA"
        | "SEPARAÇÃO"
        | "CONFERÊNCIA"
        | "CARREGAMENTO"
      enum_origem_inventario: "MANUAL" | "AUTOMATICO" | "ROTATIVO_SISTEMA"
      enum_prioridade_ocorrencia: "BAIXA" | "NORMAL" | "ALTA" | "CRITICA"
      enum_prioridade_onda: "URGENTE" | "ALTA" | "NORMAL" | "BAIXA"
      enum_situacao_endereco:
        | "LIVRE"
        | "OCUPADO"
        | "BLOQUEADO"
        | "BLOQUEADO_INVENTARIO"
      enum_status_abastecimento:
        | "GERADO"
        | "EM_EXECUCAO"
        | "FINALIZADO"
        | "CANCELADO"
      enum_status_execucao_tarefa:
        | "ATRIBUIDA"
        | "EM_ANDAMENTO"
        | "PAUSADA"
        | "CONCLUIDA"
        | "CANCELADA"
        | "COLETA_PENDENTE"
      enum_status_inventario:
        | "CRIADO"
        | "GERANDO_TAREFAS"
        | "EM_CONTAGEM"
        | "AGUARDANDO_RECONTAGEM"
        | "EM_ANALISE"
        | "FINALIZADO"
      enum_status_item_movimento:
        | "PENDENTE"
        | "EM_ANDAMENTO"
        | "CONCLUIDO"
        | "CANCELADO"
        | "CONFERIDO"
        | "DIVERGENTE"
        | "ARMAZENADO"
        | "COM_OCORRENCIA"
      enum_status_item_onda:
        | "PENDENTE"
        | "EM_PICKING"
        | "CORTE_TOTAL"
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
        | "CANCELADO"
      enum_status_ocorrencia:
        | "ABERTA"
        | "EM_INVESTIGACAO"
        | "EM_TRATAMENTO"
        | "RESOLVIDA"
        | "CANCELADA"
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
        | "EXPORTADA_ERP"
      enum_status_tarefa:
        | "CRIADA"
        | "ATRIBUIDA"
        | "EM_ANDAMENTO"
        | "PAUSADA"
        | "CONCLUIDA"
        | "AUDITADA"
        | "CANCELADA"
        | "DIVERGENTE"
      enum_status_volume: "ABERTO" | "FECHADO" | "CONFERIDO" | "EXPEDIDO"
      enum_tamanho_hu: "P" | "M" | "G" | "GG" | "EG"
      enum_tipo_abastecimento: "PREVENTIVO" | "CORRETIVO"
      enum_tipo_box: "RECEBIMENTO" | "SEPARACAO" | "EXPEDICAO"
      enum_tipo_conferencia:
        | "Nenhuma"
        | "Por item"
        | "Por volume"
        | "Por HU"
        | "Por pedido/Item"
        | "Por HU/Item"
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
        | "CONFERENCIA"
      enum_tipo_execucao_tarefa_movimento:
        | "Individual"
        | "Paralela"
        | "Sequencial"
      enum_tipo_grupo: "PICKING" | "ARMAZENAGEM" | "INVENTARIO"
      enum_tipo_hu: "PALLET" | "CAIXA" | "VOLUME" | "OUTRO"
      enum_tipo_inventario:
        | "GERAL"
        | "ROTATIVO"
        | "ENDERECO"
        | "PRODUTO"
        | "ZONA"
        | "GRUPO_PRODUTO"
      enum_tipo_ocorrencia:
        | "FALTA"
        | "SOBRA"
        | "AVARIA"
        | "DIVERGENCIA_INVENTARIO"
        | "EXTRAVIO"
        | "PRODUTO_INCORRETO"
        | "VALIDADE_INCORRETA"
        | "LOTE_INCORRETO"
        | "OUTROS"
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
      resultado_separacao_pdv: {
        total_itens_pdv: number | null
        total_auto_separados: number | null
        total_parciais: number | null
        total_sem_saldo: number | null
        mensagem: string | null
      }
      resultado_validacao_docs_onda: {
        tipo_saida_id: string | null
        libera_mov_auto: boolean | null
        prioridade: Database["public"]["Enums"]["enum_prioridade_onda"] | null
        total_docs: number | null
        realiza_conferencia: boolean | null
        conferencia_cega: boolean | null
        gera_volume_etapa:
          | Database["public"]["Enums"]["enum_momento_geracao_volume"]
          | null
        gera_abastecimento_automatico: boolean | null
      }
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
      enum_acao_permissao: ["CREATE", "READ", "UPDATE", "DELETE", "EXECUTE"],
      enum_agrupar_conf_por: ["DOCUMENTO", "HU", "BOX", "ROTA"],
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
      enum_ambiente_modulo: ["WEB", "COLETOR", "AMBOS"],
      enum_categoria_ocorrencia: ["PREVENTIVA", "CORRETIVA"],
      enum_criterio_selecao_inventario: [
        "CURVA_VENDAS",
        "CURVA_ACESSO",
        "CORTES",
        "ESTORNOS",
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
        "INVENTARIO",
        "AUDITORIA",
      ],
      enum_execucao_inventario: ["AUDITORIA", "ATUALIZACAO"],
      enum_habilidade: ["TREINANDO", "BASICO", "BOM", "ESPECIALISTA"],
      enum_lado: ["PAR", "IMPAR"],
      enum_momento_geracao_volume: [
        "NENHUMA",
        "SEPARAÇÃO",
        "CONFERÊNCIA",
        "CARREGAMENTO",
      ],
      enum_origem_inventario: ["MANUAL", "AUTOMATICO", "ROTATIVO_SISTEMA"],
      enum_prioridade_ocorrencia: ["BAIXA", "NORMAL", "ALTA", "CRITICA"],
      enum_prioridade_onda: ["URGENTE", "ALTA", "NORMAL", "BAIXA"],
      enum_situacao_endereco: [
        "LIVRE",
        "OCUPADO",
        "BLOQUEADO",
        "BLOQUEADO_INVENTARIO",
      ],
      enum_status_abastecimento: [
        "GERADO",
        "EM_EXECUCAO",
        "FINALIZADO",
        "CANCELADO",
      ],
      enum_status_execucao_tarefa: [
        "ATRIBUIDA",
        "EM_ANDAMENTO",
        "PAUSADA",
        "CONCLUIDA",
        "CANCELADA",
        "COLETA_PENDENTE",
      ],
      enum_status_inventario: [
        "CRIADO",
        "GERANDO_TAREFAS",
        "EM_CONTAGEM",
        "AGUARDANDO_RECONTAGEM",
        "EM_ANALISE",
        "FINALIZADO",
      ],
      enum_status_item_movimento: [
        "PENDENTE",
        "EM_ANDAMENTO",
        "CONCLUIDO",
        "CANCELADO",
        "CONFERIDO",
        "DIVERGENTE",
        "ARMAZENADO",
        "COM_OCORRENCIA",
      ],
      enum_status_item_onda: [
        "PENDENTE",
        "EM_PICKING",
        "CORTE_TOTAL",
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
        "CANCELADO",
      ],
      enum_status_ocorrencia: [
        "ABERTA",
        "EM_INVESTIGACAO",
        "EM_TRATAMENTO",
        "RESOLVIDA",
        "CANCELADA",
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
        "EXPORTADA_ERP",
      ],
      enum_status_tarefa: [
        "CRIADA",
        "ATRIBUIDA",
        "EM_ANDAMENTO",
        "PAUSADA",
        "CONCLUIDA",
        "AUDITADA",
        "CANCELADA",
        "DIVERGENTE",
      ],
      enum_status_volume: ["ABERTO", "FECHADO", "CONFERIDO", "EXPEDIDO"],
      enum_tamanho_hu: ["P", "M", "G", "GG", "EG"],
      enum_tipo_abastecimento: ["PREVENTIVO", "CORRETIVO"],
      enum_tipo_box: ["RECEBIMENTO", "SEPARACAO", "EXPEDICAO"],
      enum_tipo_conferencia: [
        "Nenhuma",
        "Por item",
        "Por volume",
        "Por HU",
        "Por pedido/Item",
        "Por HU/Item",
      ],
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
        "CONFERENCIA",
      ],
      enum_tipo_execucao_tarefa_movimento: [
        "Individual",
        "Paralela",
        "Sequencial",
      ],
      enum_tipo_grupo: ["PICKING", "ARMAZENAGEM", "INVENTARIO"],
      enum_tipo_hu: ["PALLET", "CAIXA", "VOLUME", "OUTRO"],
      enum_tipo_inventario: [
        "GERAL",
        "ROTATIVO",
        "ENDERECO",
        "PRODUTO",
        "ZONA",
        "GRUPO_PRODUTO",
      ],
      enum_tipo_ocorrencia: [
        "FALTA",
        "SOBRA",
        "AVARIA",
        "DIVERGENCIA_INVENTARIO",
        "EXTRAVIO",
        "PRODUTO_INCORRETO",
        "VALIDADE_INCORRETA",
        "LOTE_INCORRETO",
        "OUTROS",
      ],
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
