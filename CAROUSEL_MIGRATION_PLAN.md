# Plano de Migração e Refatoração do Carousel

## Objetivo
Integrar todo o conteúdo da pasta `Carousel-Template` diretamente no projeto `src/`, criando uma estrutura modular, limpa e coesa.

## Status Atual
- ✅ Estrutura de diretórios criada
- ✅ Tipos consolidados em `src/types/carousel.ts`
- ✅ Utilitários extraídos:
  - `src/utils/carousel/logger.ts`
  - `src/utils/carousel/media.ts`
  - `src/utils/carousel/math.ts`
  - `src/utils/carousel/dom.ts`

## Estrutura Final Prevista

```
src/
├── components/
│   └── carousel/
│       ├── CarouselEditorTabs.tsx
│       ├── CarouselGenerator.tsx
│       ├── GenerationQueue.tsx
│       ├── TemplateSelectionModal.tsx
│       ├── viewer/
│       │   ├── CarouselViewer.tsx (componente principal refatorado)
│       │   ├── ImageDragHandler.tsx
│       │   ├── VideoCropHandler.tsx  
│       │   ├── TextEditor.tsx
│       │   ├── BackgroundEditor.tsx
│       │   ├── ResizePinchers.tsx
│       │   ├── PlayOverlay.tsx
│       │   └── index.ts
│       └── index.ts
├── services/
│   └── carousel/
│       ├── carousel.service.ts
│       ├── template.service.ts
│       ├── templateRenderer.service.ts
│       ├── imageSearch.service.ts
│       └── index.ts
├── hooks/
│   └── carousel/
│       ├── useCarousel.ts
│       └── index.ts
├── utils/
│   └── carousel/
│       ├── logger.ts ✅
│       ├── media.ts ✅
│       ├── math.ts ✅
│       ├── dom.ts ✅
│       ├── video.ts (a criar)
│       └── index.ts (a criar)
├── types/
│   └── carousel.ts ✅
└── config/
    └── carousel.ts (a criar)
```

## Refatoração do CarouselViewer (2083 linhas)

### Módulos a Extrair:

1. **ImageDragHandler.tsx** (~300 linhas)
   - `imgDragState`
   - `ensureImgCropWrapper`
   - Lógica de drag & drop de imagens
   - `normFill`, `attachResizePinchers`

2. **VideoCropHandler.tsx** (~200 linhas)
   - `videoCropState`
   - Lógica de crop de vídeos
   - `forceVideoStyle`

3. **PlayOverlay.tsx** (~150 linhas)
   - `playOverlayMap`
   - `attachPlayOverlay`
   - `removeAllPlayOverlays`
   - `safeUserPlay`

4. **TextEditor.tsx** (~200 linhas)
   - Lógica de edição de texto
   - `extractTextStyles`
   - `readAndStoreComputedTextStyles`

5. **BackgroundEditor.tsx** (~300 linhas)
   - `applyBackgroundImageImmediate`
   - `findLargestVisual`
   - `getBgElements`
   - Lógica de troca de backgrounds

6. **ResizePinchers.tsx** (~200 linhas)
   - `attachResizePinchers`
   - `disposePinchersInDoc`
   - `ensureHostResizeObserver`

7. **CarouselViewer.tsx** (componente principal, ~700 linhas)
   - Estado principal do React
   - Orquestração dos submódulos
   - Renderização do UI
   - Event handlers de alto nível

## Plano de Execução

### Fase 1: Preparação ✅
- [x] Criar estrutura de diretórios
- [x] Consolidar tipos
- [x] Extrair utilitários básicos

### Fase 2: Migração de Serviços
- [ ] Copiar serviços para `src/services/carousel/`
- [ ] Atualizar imports
- [ ] Adicionar index.ts

### Fase 3: Migração de Componentes Simples
- [ ] Migrar GenerationQueue
- [ ] Migrar TemplateSelectionModal
- [ ] Migrar CarouselGenerator  
- [ ] Migrar CarouselEditorTabs

### Fase 4: Refatoração do CarouselViewer
- [ ] Extrair ImageDragHandler
- [ ] Extrair VideoCropHandler
- [ ] Extrair PlayOverlay
- [ ] Extrair TextEditor
- [ ] Extrair BackgroundEditor
- [ ] Extrair ResizePinchers
- [ ] Refatorar componente principal

### Fase 5: Migração de Hooks e Config
- [ ] Migrar useCarousel hook
- [ ] Migrar configuração

### Fase 6: Atualização de Imports
- [ ] Atualizar imports em todas as páginas
- [ ] Atualizar imports em App.tsx
- [ ] Atualizar imports em contexts

### Fase 7: Limpeza
- [ ] Deletar pasta Carousel-Template
- [ ] Verificar build
- [ ] Testar todas as funcionalidades

## Notas Importantes

- **Nenhuma funcionalidade** deve ser alterada
- **Todos os estilos** devem ser preservados
- **Todos os comportamentos** devem permanecer idênticos
- Código deve ficar **mais limpo e modular**
- Facilitar **manutenção futura**
