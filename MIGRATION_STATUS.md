# Status da Migração do Carousel - Atualização em Tempo Real

## ✅ Concluído Até Agora

### 1. Estrutura de Diretórios Criada
```
src/
├── components/carousel/        ✅ Criado
│   └── viewer/                 ✅ Criado
├── services/carousel/          ✅ Criado
├── hooks/carousel/             ✅ Criado
├── utils/carousel/             ✅ Criado
├── types/carousel.ts           ✅ Criado
└── config/carousel.ts          ✅ Criado
```

### 2. Arquivos Migrados e Criados

#### Tipos ✅
- ✅ `src/types/carousel.ts` - Todos os tipos consolidados
  - CarouselData, CarouselTab, ElementStyles
  - TemplateConfig, AVAILABLE_TEMPLATES
  - GenerationQueueItem, QueueStatus
  - ImgDragState, VideoCropState

#### Utilitários ✅
- ✅ `src/utils/carousel/logger.ts` - Funções de log
- ✅ `src/utils/carousel/media.ts` - isVideoUrl, isImgurUrl, etc
- ✅ `src/utils/carousel/math.ts` - clamp, computeCoverBleed
- ✅ `src/utils/carousel/dom.ts` - Manipulação DOM
- ✅ `src/utils/carousel/index.ts` - Export consolidado

#### Serviços ✅
- ✅ `src/services/carousel/carousel.service.ts`
- ✅ `src/services/carousel/template.service.ts`
- ✅ `src/services/carousel/templateRenderer.service.ts`
- ✅ `src/services/carousel/index.ts`

#### Config ✅
- ✅ `src/config/carousel.ts` - configureCarousel, getCarouselConfig

#### Componentes (Copiados, Precisam Atualização de Imports) ⚠️
- ⚠️  `src/components/carousel/GenerationQueue.tsx`
- ⚠️  `src/components/carousel/TemplateSelectionModal.tsx`
- ⚠️  `src/components/carousel/CarouselEditorTabs.tsx`
- ⚠️  `src/components/carousel/CarouselGenerator.tsx`
- ⚠️  `src/components/carousel/viewer/CarouselViewer.tsx` (2083 linhas - requer refatoração)
- ✅ `src/components/carousel/index.ts`

#### Hooks ✅
- ⚠️  `src/hooks/carousel/useCarousel.ts` (precisa atualizar imports)
- ✅ `src/hooks/carousel/index.ts`

#### Export Central ✅
- ✅ `src/carousel.ts` - Ponto único de exportação

## 🔄 Próximos Passos (Por Ordem de Prioridade)

### PASSO 1: Atualizar Imports nos Componentes Migrados
Todos os arquivos copiados ainda referenciam `'../types'` e `'../services'` do Carousel-Template.
Precisam ser atualizados para:
```typescript
// Antigo (Carousel-Template)
import { CarouselData } from '../types';
import { generateCarousel } from '../services';

// Novo (src/)
import { CarouselData } from '../../types/carousel';
import { generateCarousel } from '../../services/carousel';
```

**Arquivos que precisam atualização:**
1. `src/components/carousel/GenerationQueue.tsx`
2. `src/components/carousel/TemplateSelectionModal.tsx`
3. `src/components/carousel/CarouselEditorTabs.tsx`
4. `src/components/carousel/CarouselGenerator.tsx`
5. `src/components/carousel/viewer/CarouselViewer.tsx`
6. `src/hooks/carousel/useCarousel.ts`
7. `src/services/carousel/*.ts` (podem ter imports internos)

### PASSO 2: Refatorar CarouselViewer (Grande Tarefa)

O arquivo `CarouselViewer.tsx` tem **2083 linhas** e precisa ser dividido em:

1. **ImageDragHandler.tsx** (~300 linhas)
   - Gerenciamento de drag & drop de imagens
   - `imgDragState`, `ensureImgCropWrapper`, `normFill`

2. **VideoCropHandler.tsx** (~200 linhas)
   - Crop de vídeos
   - `videoCropState`, `forceVideoStyle`

3. **PlayOverlay.tsx** (~150 linhas)
   - Controles de play de vídeo
   - `attachPlayOverlay`, `safeUserPlay`

4. **TextEditor.tsx** (~200 linhas)
   - Edição de textos
   - Gerenciamento de estilos

5. **BackgroundEditor.tsx** (~300 linhas)
   - Troca de backgrounds
   - `applyBackgroundImageImmediate`, `findLargestVisual`

6. **ResizePinchers.tsx** (~200 linhas)
   - Controles de redimensionamento
   - `attachResizePinchers`, `ensureHostResizeObserver`

7. **CarouselViewer.tsx** (~700 linhas - componente principal)
   - Orquestração
   - UI e renderização
   - Event handlers de alto nível

### PASSO 3: Atualizar Imports do Projeto Inteiro

Todos os arquivos que importam do `Carousel-Template` precisam ser atualizados:

**Arquivos Principais:**
- `src/App.tsx`
- `src/pages/FeedPage.tsx`
- `src/pages/NewsPage.tsx`
- `src/pages/GalleryPage.tsx`
- `src/contexts/GenerationQueueContext.tsx`
- `src/contexts/EditorTabsContext.tsx`

**Padrão de Mudança:**
```typescript
// Antigo
import { CarouselViewer, GenerationQueue } from '../Carousel-Template';

// Novo
import { CarouselViewer, GenerationQueue } from './carousel';
// ou
import { CarouselViewer, GenerationQueue } from '../carousel';
```

### PASSO 4: Validação e Limpeza

1. Executar `npm run build` para verificar erros
2. Testar todas as funcionalidades:
   - Abrir editor de carousel
   - Gerar carousel
   - Editar textos
   - Trocar imagens/vídeos
   - Visualizar fila
3. Se tudo funcionar → Deletar `Carousel-Template/`
4. Commit final

## 📋 Resumo do Que Falta

| Tarefa | Status | Estimativa |
|--------|--------|------------|
| Atualizar imports em componentes carousel | 🔴 Pendente | ~30min |
| Refatorar CarouselViewer em 7 módulos | 🔴 Pendente | ~2-3h |
| Atualizar imports em páginas/App | 🔴 Pendente | ~20min |
| Testar funcionalidades | 🔴 Pendente | ~30min |
| Limpar Carousel-Template/ | 🔴 Pendente | ~5min |

## 🎯 Recomendação

Como esta é uma tarefa grande e complexa, sugiro continuar em etapas:

1. **Primeiro**: Atualizar todos os imports (mais seguro, menos invasivo)
2. **Segundo**: Refatorar o CarouselViewer  
3. **Terceiro**: Validação completa e limpeza

Cada etapa pode ser um commit separado para facilitar rollback se necessário.

## 📝 Comandos Úteis

```bash
# Verificar todos os imports do Carousel-Template no projeto
grep -r "from.*Carousel-Template" src/

# Contar linhas do CarouselViewer original
wc -l Carousel-Template/components/CarouselViewer.tsx

# Build para verificar erros
npm run build

# Deletar Carousel-Template (APENAS DEPOIS DE TUDO TESTADO)
rm -rf Carousel-Template/
```
