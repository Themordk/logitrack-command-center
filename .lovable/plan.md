
# Plano PWA - CORE LogiTrack WMS

## ✅ Fase 1 - MVP PWA (Implementado)

- [x] `vite-plugin-pwa` instalado e configurado em `vite.config.ts`
- [x] Manifest PWA com nome, cores, ícones, orientação portrait, start_url coletor
- [x] Meta tags Apple/PWA no `index.html`
- [x] Ícones PWA 192x192 e 512x512 gerados
- [x] `UpdatePrompt.tsx` - banner de atualização não-intrusivo
- [x] Service Worker com cache strategies (NetworkFirst para API, CacheFirst para fonts/assets)
- [x] `navigateFallbackDenylist` para `/~oauth`

## ✅ Fase 2 - UX Operacional (Implementado)

- [x] `useFeedback.ts` - hook de feedback sonoro (AudioContext) e vibratil
- [x] `ScanField.tsx` - integração com feedback de sucesso no scan
- [x] `ScanField.tsx` - `inputMode="none"` condicional para coletores físicos
- [x] `ConfiguracoesPage.tsx` - seleção de tipo de dispositivo (Coletor/Celular)
- [x] Auto re-focus ao voltar de overlays

## 🔲 Fase 3 - Resiliência Offline (Pendente)

- [ ] `offlineQueue.ts` - fila IndexedDB para RPCs offline
- [ ] Badge de operações pendentes no header
- [ ] Cache de tarefas em IndexedDB
- [ ] Toast de sincronização ao reconectar

## 🔲 Fase 4 - Performance (Pendente)

- [ ] Code splitting com React.lazy para admin vs coletor
- [ ] manualChunks para vendor splitting

## 🔲 Fase 5 - Integração Hardware (Parcialmente Implementado)

- [x] Tipo de dispositivo nas configurações
- [ ] Timeout para distinguir scan rápido de digitação
- [ ] Scanner por câmera (futuro)

## 🔲 Fase 7 - Instalação (Pendente)

- [ ] Página `/coletor/instalar` com instruções visuais
- [ ] Interceptar `beforeinstallprompt`
- [ ] QR Code na tela de login admin

---

# Plano RBAC - CORE LogiTrack WMS

## ✅ Fase 1 - Modelagem de Dados (Implementado)

- [x] Enums: `enum_ambiente_modulo`, `enum_acao_permissao`
- [x] Tabelas: `modulo`, `perfil`, `permissao`, `perfil_permissao`, `usuario_perfil`
- [x] RLS em todas as tabelas novas
- [x] Funções: `fn_usuario_tem_permissao`, `fn_usuario_permissoes`
- [x] Função seed: `fn_seed_rbac_para_tenant`

## ✅ Fase 2 - Backend (Implementado)

- [x] Edge Function `create-usuario` atribui perfil automaticamente

## ✅ Fase 3 - Frontend Context (Implementado)

- [x] `PermissionsContext.tsx` com cache sessionStorage (TTL 5min)
- [x] `usePermissions()` hook com `can(modulo, acao)` e `canAny(modulo)`
- [x] `PermissionGate.tsx` - oculta componentes por permissão
- [x] `ProtectedRoute.tsx` - bloqueia rotas sem permissão
- [x] `useRoutePermission.ts` - mapeamento rotas → módulos

## ✅ Fase 4 - Integração (Implementado)

- [x] TopNav filtra menus por permissão READ
- [x] CrudTable aceita `canCreate`, `canEdit`, `canDelete`
- [x] ColetorHomePage filtra módulos por permissão

## ✅ Fase 5 - Gestão de Perfis (Implementado)

- [x] `PerfisAcessoPage.tsx` em `/config/perfis`
- [x] CRUD de perfis personalizados
- [x] Árvore de permissões com checkboxes por ação (C/R/U/D/Execute)

## 🔲 Fase 6 - Auditoria (Pendente)

- [ ] Tabela `log_acesso` com registro de ações sensíveis
- [ ] Validação server-side em RPCs críticas via `fn_usuario_tem_permissao`

## 🔲 Fase 7 - Evolução (Pendente)

- [ ] Multi-select de perfis na página de Usuários
- [ ] Testes e2e de segurança
- [ ] Evolução para ABAC com `condicao_jsonb`
