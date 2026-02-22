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
          armazem_id: string
          created_at: string | null
          data_emissao: string
          data_entrada: string
          id: string
          numero_nota: string
          parceiro_id: string
          status: number
          tipo_entrada_id: string
          valor_total_nota: number
          valor_total_produtos: number
        }
        Insert: {
          armazem_id: string
          created_at?: string | null
          data_emissao: string
          data_entrada: string
          id?: string
          numero_nota: string
          parceiro_id: string
          status: number
          tipo_entrada_id: string
          valor_total_nota: number
          valor_total_produtos: number
        }
        Update: {
          armazem_id?: string
          created_at?: string | null
          data_emissao?: string
          data_entrada?: string
          id?: string
          numero_nota?: string
          parceiro_id?: string
          status?: number
          tipo_entrada_id?: string
          valor_total_nota?: number
          valor_total_produtos?: number
        }
        Relationships: [
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
          valor_total: number
          valor_unidade: number
        }
        Insert: {
          documento_entrada_id: string
          id?: string
          produto_id: string
          quantidade: number
          valor_total: number
          valor_unidade: number
        }
        Update: {
          documento_entrada_id?: string
          id?: string
          produto_id?: string
          quantidade?: number
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
          validade: string
        }
        Insert: {
          documento_entrada_item_id: string
          fabricacao: string
          id?: string
          lote: string
          quantidade: number
          serie?: string | null
          validade: string
        }
        Update: {
          documento_entrada_item_id?: string
          fabricacao?: string
          id?: string
          lote?: string
          quantidade?: number
          serie?: string | null
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
          total_pallet: number
        }
        Insert: {
          altura?: number | null
          apto: number
          armazem_id: string
          ativo?: boolean
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
          total_pallet: number
        }
        Update: {
          altura?: number | null
          apto?: number
          armazem_id?: string
          ativo?: boolean
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
          total_pallet?: number
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
      grupo_produto: {
        Row: {
          ativo: boolean
          descricao: string
          empresa_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          descricao: string
          empresa_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
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
          armazem_id: string
          codigo_hu: string | null
          disponibilidade:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          id: string
          m3: number | null
          peso_bruto: number | null
          tamanho: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id: string
          tipo_hu: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Insert: {
          altura?: number | null
          armazem_id: string
          codigo_hu?: string | null
          disponibilidade?:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          id?: string
          m3?: number | null
          peso_bruto?: number | null
          tamanho?: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id: string
          tipo_hu?: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Update: {
          altura?: number | null
          armazem_id?: string
          codigo_hu?: string | null
          disponibilidade?:
            | Database["public"]["Enums"]["enum_disponibilidade_hu"]
            | null
          id?: string
          m3?: number | null
          peso_bruto?: number | null
          tamanho?: Database["public"]["Enums"]["enum_tamanho_hu"] | null
          tenant_id?: string
          tipo_hu?: Database["public"]["Enums"]["enum_tipo_hu"] | null
        }
        Relationships: [
          {
            foreignKeyName: "hu_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
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
          box_id: string
          confirma_volume: boolean
          created_at: string | null
          created_by: string | null
          crossdocking: boolean
          finalizado_em: string | null
          id: string
          observacao: string | null
          placa_veiculo: string | null
          status: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          valor_descarga: number | null
        }
        Insert: {
          armazem_id: string
          box_id: string
          confirma_volume?: boolean
          created_at?: string | null
          created_by?: string | null
          crossdocking?: boolean
          finalizado_em?: string | null
          id?: string
          observacao?: string | null
          placa_veiculo?: string | null
          status?: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          valor_descarga?: number | null
        }
        Update: {
          armazem_id?: string
          box_id?: string
          confirma_volume?: boolean
          created_at?: string | null
          created_by?: string | null
          crossdocking?: boolean
          finalizado_em?: string | null
          id?: string
          observacao?: string | null
          placa_veiculo?: string | null
          status?: Database["public"]["Enums"]["enum_status_mov_entrada"] | null
          valor_descarga?: number | null
        }
        Relationships: []
      }
      movimento_entrada_documento: {
        Row: {
          documento_entrada_id: string
          id: string
          movimento_entrada_id: string
        }
        Insert: {
          documento_entrada_id: string
          id?: string
          movimento_entrada_id: string
        }
        Update: {
          documento_entrada_id?: string
          id?: string
          movimento_entrada_id?: string
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
        ]
      }
      movimento_entrada_item: {
        Row: {
          documento_entrada_item_id: string
          id: string
          movimento_entrada_id: string
          produto_id: string
          qtd_conferida: number
          qtd_esperada: number
        }
        Insert: {
          documento_entrada_item_id: string
          id?: string
          movimento_entrada_id: string
          produto_id: string
          qtd_conferida?: number
          qtd_esperada: number
        }
        Update: {
          documento_entrada_item_id?: string
          id?: string
          movimento_entrada_id?: string
          produto_id?: string
          qtd_conferida?: number
          qtd_esperada?: number
        }
        Relationships: [
          {
            foreignKeyName: "movimento_entrada_item_documento_entrada_item_id_fkey"
            columns: ["documento_entrada_item_id"]
            isOneToOne: false
            referencedRelation: "documento_entrada_item"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimento_entrada_item_movimento_entrada_id_fkey"
            columns: ["movimento_entrada_id"]
            isOneToOne: false
            referencedRelation: "movimento_entrada"
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
          descricao: string
          empresa_id: string
          grupo_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          ativo?: boolean
          descricao: string
          empresa_id: string
          grupo_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          ativo?: boolean
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
        }
        Insert: {
          ativo?: boolean
          coderp?: string | null
          descricao: string
          empresa_id: string
          id?: string
        }
        Update: {
          ativo?: boolean
          coderp?: string | null
          descricao?: string
          empresa_id?: string
          id?: string
        }
        Relationships: []
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
          armazem_id: string
          codigo_volume: string
          created_at: string
          hu_id: string | null
          id: string
          m3: number | null
          pedido_id: string
          peso_bruto: number | null
          status: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id: string
        }
        Insert: {
          armazem_id: string
          codigo_volume: string
          created_at?: string
          hu_id?: string | null
          id?: string
          m3?: number | null
          pedido_id: string
          peso_bruto?: number | null
          status?: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id: string
        }
        Update: {
          armazem_id?: string
          codigo_volume?: string
          created_at?: string
          hu_id?: string | null
          id?: string
          m3?: number | null
          pedido_id?: string
          peso_bruto?: number | null
          status?: Database["public"]["Enums"]["enum_status_volume"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "volume_expedicao_armazem_id_fkey"
            columns: ["armazem_id"]
            isOneToOne: false
            referencedRelation: "armazem"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volume_expedicao_hu_id_fkey"
            columns: ["hu_id"]
            isOneToOne: false
            referencedRelation: "hu"
            referencedColumns: ["id"]
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
      [_ in never]: never
    }
    Functions: {
      get_current_tenant: { Args: never; Returns: string }
    }
    Enums: {
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
      enum_situacao_endereco: "LIVRE" | "OCUPADO" | "BLOQUEADO"
      enum_status_mov_entrada:
        | "GERADO"
        | "LIBERADO"
        | "EM CONFERENCIA"
        | "CONFERIDO"
        | "DIVERGENCIA"
        | "LIB. ARMAZENAGEM"
        | "ARMAZENADO"
      enum_status_volume: "ABERTO" | "FECHADO" | "CONFERIDO" | "EXPEDIDO"
      enum_tamanho_hu: "P" | "M" | "G" | "GG" | "EG"
      enum_tipo_box: "RECEBIMENTO" | "SEPARACAO" | "EXPEDICAO"
      enum_tipo_controle: "UNIDADE" | "LOTE" | "VALIDADE" | "SERIE" | "METROS"
      enum_tipo_endereco: "PULMAO" | "PICKING"
      enum_tipo_grupo: "PICKING" | "ARMAZENAGEM" | "INVENTARIO"
      enum_tipo_hu: "PALLET" | "CAIXA" | "VOLUME" | "OUTRO"
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
        | "porta_palete"
        | "blocado"
        | "prateleira"
        | "flow_rack"
        | "drive_in"
        | "mezanino"
        | "doca"
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
      enum_situacao_endereco: ["LIVRE", "OCUPADO", "BLOQUEADO"],
      enum_status_mov_entrada: [
        "GERADO",
        "LIBERADO",
        "EM CONFERENCIA",
        "CONFERIDO",
        "DIVERGENCIA",
        "LIB. ARMAZENAGEM",
        "ARMAZENADO",
      ],
      enum_status_volume: ["ABERTO", "FECHADO", "CONFERIDO", "EXPEDIDO"],
      enum_tamanho_hu: ["P", "M", "G", "GG", "EG"],
      enum_tipo_box: ["RECEBIMENTO", "SEPARACAO", "EXPEDICAO"],
      enum_tipo_controle: ["UNIDADE", "LOTE", "VALIDADE", "SERIE", "METROS"],
      enum_tipo_endereco: ["PULMAO", "PICKING"],
      enum_tipo_grupo: ["PICKING", "ARMAZENAGEM", "INVENTARIO"],
      enum_tipo_hu: ["PALLET", "CAIXA", "VOLUME", "OUTRO"],
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
        "porta_palete",
        "blocado",
        "prateleira",
        "flow_rack",
        "drive_in",
        "mezanino",
        "doca",
      ],
    },
  },
} as const
