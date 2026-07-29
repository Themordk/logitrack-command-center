## Objetivo
Ajustes finais na tela de Templates de Etiqueta, no gerador ZPL e no modal de impressão de endereço, conforme o documento enviado.

## 1. `src/pages/EtiquetaTemplatesPage.tsx`
- **Abas**: remover a aba "Preview Visual". `Tabs` passa a `defaultValue="termica"`, `TabsList` vira `grid-cols-2`, com ordem: **Preview Térmica** (1ª) e **Código ZPL** (2ª). Remover o `TabsContent value="preview"`, mantendo intactos os imports dos componentes de preview, a função `RenderPreview` e o `previewConfig` (usados/reservados em outros pontos).
- **Sincronização ZPL**: no `useEffect` que carrega o template selecionado, sempre definir `zplEditado = false` (mesmo quando `corpo_zpl` existir). Assim, `zplEditado` passa a significar apenas "usuário digitou no textarea", e mudanças em cabeçalho, escala de fonte, campos ativos e ordenação voltam a regenerar o ZPL automaticamente. Botão "Regenerar" continua resetando para `false`.
- **Campos removidos do formulário** (são opções de impressão, não do template): checkbox "Impressão em 2 colunas", input "Intervalo (mm)", select "Direção da Seta" (bloco de ENDERECO) e o parágrafo explicativo abaixo deles. Os campos `duas_colunas`, `intervalo_colunas_mm` e `direcao_seta` permanecem no tipo `EtiquetaConfig` e nos payloads de `handleSave` e `handleCreateNew` com seus valores padrão.

## 2. `src/lib/zplGenerator.ts`
- Em `gerarZplEndereco`, remover a geração da seta fixa a partir de `config.direcao_seta` e reservar a área da seta com o placeholder `{{seta_simbolo}}` (largura ~80 dots ao lado da descrição), preenchido pelo agente de impressão no momento da renderização.
- Remover a função auxiliar `setaChar` (usada só para essa seta).
- Nenhuma outra alteração no gerador; `duas_colunas` continua suportado.

## 3. `src/components/etiqueta/PrintEtiquetaEnderecoModal.tsx`
- Incluir `direcao_seta: direcaoSeta || "NENHUMA"` no `p_dados` da RPC `solicitar_impressao`, para que o job carregue a seta escolhida pelo usuário.

## Notas técnicas
- Sem novas dependências; sem migração de banco.
- Padrões mantidos: hash routing, `useTenant()`, cliente Supabase existente, `sonner`, shadcn/ui.
- A conversão de `direcao_seta` em `seta_simbolo` é responsabilidade do agente de impressão (fora deste repositório).