# Carousel Template Module

Módulo independente e plugável para geração e edição de carrosséis no Instagram.

## Estrutura do Módulo

```
Carousel-Template/
├── components/          # Componentes de UI
│   ├── CarouselViewer.tsx
│   ├── TemplateSelectionModal.tsx
│   ├── GenerationQueue.tsx
│   └── CarouselGenerator.tsx (wrapper principal)
├── services/           # Lógica de negócio
│   ├── carousel.service.ts
│   ├── template.service.ts
│   └── templateRenderer.service.ts
├── hooks/              # Hooks React personalizados
│   └── useCarousel.ts
├── types/              # Tipos e interfaces TypeScript
│   ├── carousel.types.ts
│   ├── template.types.ts
│   └── queue.types.ts
├── config/             # Configurações centralizadas
│   └── index.ts
├── index.ts            # Ponto de entrada principal
└── README.md           # Documentação
```

## Instalação

1. Copie a pasta `Carousel-Template` para o seu projeto:

```bash
cp -r Carousel-Template /seu-projeto/
```

2. Certifique-se de ter as dependências necessárias instaladas:

```bash
npm install react react-dom lucide-react framer-motion
```

## Configuração

### 1. Configurar o Módulo

Antes de usar o módulo, configure os endpoints e credenciais:

```typescript
import { configureCarousel } from './Carousel-Template';

configureCarousel({
  webhook: {
    generateCarousel: 'https://seu-webhook.com/generateCarousel',
    searchImages: 'https://seu-webhook.com/searchImages',
  },
  minio: {
    endpoint: 'https://seu-s3.com',
    bucket: 'seu-bucket',
  },
  templates: {
    totalSlides: 10, // Número de slides por template
  },
});
```

### 2. Configuração com Variáveis de Ambiente (Opcional)

Você pode usar variáveis de ambiente para configurar automaticamente:

```typescript
// No seu arquivo de inicialização
import { configureCarousel } from './Carousel-Template';

if (import.meta.env.VITE_MINIO_ENDPOINT) {
  configureCarousel({
    minio: {
      endpoint: import.meta.env.VITE_MINIO_ENDPOINT,
      bucket: import.meta.env.VITE_MINIO_BUCKET || 'carousel-templates',
    },
  });
}
```

## Uso Básico

### Componente Principal (Recomendado)

```typescript
import { CarouselGenerator } from './Carousel-Template';

function MyComponent() {
  return (
    <CarouselGenerator
      postCode="ABC123"
      onGenerateClick={(code) => console.log('Generating for:', code)}
    />
  );
}
```

### Com Botão Personalizado

```typescript
import { CarouselGenerator } from './Carousel-Template';

function MyComponent() {
  return (
    <CarouselGenerator
      postCode="ABC123"
      onGenerateClick={(code) => console.log('Generating for:', code)}
      renderTrigger={({ onClick }) => (
        <button onClick={onClick} className="custom-button">
          Criar Carrossel
        </button>
      )}
    />
  );
}
```

### Uso Avançado com Hook

```typescript
import { useCarousel } from './Carousel-Template/hooks';
import {
  CarouselViewer,
  GenerationQueue,
  TemplateSelectionModal,
} from './Carousel-Template';

function AdvancedComponent() {
  const {
    generationQueue,
    renderedSlides,
    carouselData,
    handleGenerateCarousel,
    closeCarousel,
  } = useCarousel();

  return (
    <div>
      <button onClick={() => handleGenerateCarousel('POST123', '1')}>
        Gerar com Template 1
      </button>

      {generationQueue.length > 0 && (
        <GenerationQueue
          items={generationQueue}
          isExpanded={true}
          onToggleExpand={() => {}}
        />
      )}

      {renderedSlides && carouselData && (
        <CarouselViewer
          slides={renderedSlides}
          carouselData={carouselData}
          onClose={closeCarousel}
        />
      )}
    </div>
  );
}
```

## API

### CarouselGenerator

Componente wrapper principal que gerencia todo o fluxo de geração.

**Props:**

- `postCode` (string, obrigatório): Código único do post para geração
- `onGenerateClick` (function, opcional): Callback chamado ao clicar em gerar
- `renderTrigger` (function, opcional): Função para renderizar botão customizado

### useCarousel Hook

Hook para controlar a geração de carrosséis programaticamente.

**Retorna:**

```typescript
{
  generationQueue: GenerationQueueItem[];      // Fila de geração
  renderedSlides: string[] | null;             // Slides renderizados
  carouselData: CarouselData | null;           // Dados do carrossel
  handleGenerateCarousel: (code, templateId) => Promise<void>;  // Gerar carrossel
  closeCarousel: () => void;                   // Fechar viewer
}
```

### Serviços

```typescript
import { generateCarousel, searchImages, templateService } from './Carousel-Template';

// Gerar carrossel via API
const result = await generateCarousel('POST123', 'template1');

// Buscar imagens
const images = await searchImages('landscape');

// Buscar template do MinIO
const slides = await templateService.fetchTemplate('1');
```

## Templates Disponíveis

O módulo vem com 6 templates pré-configurados. Para adicionar novos:

1. Edite `types/template.types.ts`
2. Adicione o template no array `AVAILABLE_TEMPLATES`
3. Faça upload dos slides HTML no MinIO

## Estrutura de Dados

### CarouselData

```typescript
{
  dados_gerais: {
    nome: string;
    arroba: string;
    foto_perfil: string;
    template: string;
  };
  conteudos: Array<{
    title: string;
    subtitle?: string;
    imagem_fundo: string;
    thumbnail_url?: string;
    imagem_fundo2?: string;
    imagem_fundo3?: string;
  }>;
}
```

## Requisitos

- React 18+
- TypeScript 5+
- Tailwind CSS (para estilos)
- Dependências:
  - `lucide-react` (ícones)
  - `framer-motion` (animações)

## Personalização

### Estilos

Os componentes usam Tailwind CSS. Para personalizar:

1. Edite as classes diretamente nos componentes
2. Use a prop `brand` no `TemplateSelectionModal`:

```typescript
<TemplateSelectionModal
  brand={{
    bg: 'bg-blue-900',
    card: 'bg-blue-800',
    border: 'border-blue-700',
    text: 'text-white',
    muted: 'text-blue-300',
    hover: 'hover:bg-blue-700',
    accent: 'ring-blue-500',
  }}
/>
```

## Troubleshooting

### Erro ao carregar templates

Verifique se:
- O endpoint MinIO está correto
- O bucket existe e está acessível
- Os arquivos HTML dos templates estão nomeados corretamente: `Slide 1.html`, `Slide 2.html`, etc.

### Erro ao gerar carrossel

Verifique se:
- O webhook está configurado corretamente
- O código do post é válido
- A API está respondendo corretamente

## Licença

Este módulo é parte de um projeto maior e segue a mesma licença do projeto principal.
