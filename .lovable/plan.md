
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
