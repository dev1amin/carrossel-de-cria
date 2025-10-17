# Exemplo de Uso do Módulo Carousel-Template

Este arquivo mostra exemplos práticos de como integrar o módulo em outro projeto.

## Instalação em Novo Projeto

### 1. Copiar o Módulo

```bash
# Copie a pasta Carousel-Template para a raiz do seu projeto
cp -r /caminho/original/Carousel-Template /seu-projeto/
```

### 2. Instalar Dependências

Adicione as dependências necessárias no `package.json` do seu projeto:

```bash
npm install react react-dom lucide-react framer-motion
```

### 3. Configurar Tailwind CSS

Certifique-se de que o Tailwind está configurado para processar os arquivos do módulo:

```js
// tailwind.config.js
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./Carousel-Template/**/*.{js,jsx,ts,tsx}", // Adicione esta linha
  ],
  // ...resto da configuração
};
```

## Exemplo 1: Uso Básico com Botão Padrão

```typescript
// src/pages/PostsPage.tsx
import { CarouselGenerator } from '../Carousel-Template';

function PostsPage() {
  const posts = [
    { id: '1', code: 'ABC123', title: 'Post 1' },
    { id: '2', code: 'DEF456', title: 'Post 2' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {posts.map(post => (
        <div key={post.id} className="border rounded p-4">
          <h3>{post.title}</h3>
          <CarouselGenerator
            postCode={post.code}
            onGenerateClick={(code) => {
              console.log(`Gerando carrossel para: ${code}`);
            }}
          />
        </div>
      ))}
    </div>
  );
}
```

## Exemplo 2: Botão Personalizado

```typescript
// src/components/CustomPostCard.tsx
import { CarouselGenerator } from '../Carousel-Template';
import { Sparkles } from 'lucide-react';

interface CustomPostCardProps {
  post: {
    code: string;
    image: string;
    likes: number;
  };
}

function CustomPostCard({ post }: CustomPostCardProps) {
  return (
    <div className="relative">
      <img src={post.image} alt="Post" />
      <p>{post.likes} likes</p>

      <CarouselGenerator
        postCode={post.code}
        renderTrigger={({ onClick }) => (
          <button
            onClick={onClick}
            className="absolute bottom-4 right-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-2 rounded-full flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Criar Carrossel</span>
          </button>
        )}
      />
    </div>
  );
}
```

## Exemplo 3: Controle Avançado com Hook

```typescript
// src/pages/AdvancedPage.tsx
import { useState } from 'react';
import { useCarousel, CarouselViewer, GenerationQueue } from '../Carousel-Template';

function AdvancedPage() {
  const [selectedPost, setSelectedPost] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('1');

  const {
    generationQueue,
    renderedSlides,
    carouselData,
    handleGenerateCarousel,
    closeCarousel,
  } = useCarousel();

  const handleGenerate = async () => {
    if (!selectedPost) {
      alert('Selecione um post');
      return;
    }

    try {
      const result = await handleGenerateCarousel(selectedPost, selectedTemplate);
      console.log('Carrossel gerado com sucesso:', result);
    } catch (error) {
      console.error('Erro ao gerar:', error);
      alert('Erro ao gerar carrossel');
    }
  };

  return (
    <div className="p-8">
      <div className="mb-4 flex gap-4">
        <input
          type="text"
          value={selectedPost}
          onChange={(e) => setSelectedPost(e.target.value)}
          placeholder="Código do post (ex: ABC123)"
          className="border px-4 py-2 rounded"
        />

        <select
          value={selectedTemplate}
          onChange={(e) => setSelectedTemplate(e.target.value)}
          className="border px-4 py-2 rounded"
        >
          <option value="1">Template 1</option>
          <option value="2">Template 2</option>
          <option value="3">Template 3</option>
        </select>

        <button
          onClick={handleGenerate}
          className="bg-blue-600 text-white px-6 py-2 rounded"
        >
          Gerar Carrossel
        </button>
      </div>

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

## Exemplo 4: Configuração com Variáveis de Ambiente

```typescript
// src/App.tsx
import { useEffect } from 'react';
import { configureCarousel } from './Carousel-Template';

function App() {
  useEffect(() => {
    // Configurar módulo na inicialização
    configureCarousel({
      webhook: {
        generateCarousel: import.meta.env.VITE_WEBHOOK_GENERATE || 'https://api.example.com/generate',
        searchImages: import.meta.env.VITE_WEBHOOK_SEARCH || 'https://api.example.com/search',
      },
      minio: {
        endpoint: import.meta.env.VITE_MINIO_ENDPOINT || 'https://s3.example.com',
        bucket: import.meta.env.VITE_MINIO_BUCKET || 'templates',
      },
      templates: {
        totalSlides: Number(import.meta.env.VITE_TOTAL_SLIDES) || 10,
      },
    });
  }, []);

  return (
    <div>
      {/* Seu aplicativo */}
    </div>
  );
}

export default App;
```

```bash
# .env
VITE_WEBHOOK_GENERATE=https://webhook.workez.online/webhook/generateCarousel
VITE_WEBHOOK_SEARCH=https://webhook.workez.online/webhook/searchImages
VITE_MINIO_ENDPOINT=https://s3.workez.online
VITE_MINIO_BUCKET=carousel-templates
VITE_TOTAL_SLIDES=10
```

## Exemplo 5: Integração com React Router

```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PostsPage from './pages/PostsPage';
import { configureCarousel } from './Carousel-Template';

function App() {
  useEffect(() => {
    configureCarousel({ /* config */ });
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/posts" element={<PostsPage />} />
        {/* outras rotas */}
      </Routes>
    </BrowserRouter>
  );
}
```

## Exemplo 6: Personalização de Cores

```typescript
// src/components/BrandedCarousel.tsx
import { CarouselGenerator } from '../Carousel-Template';

function BrandedCarousel({ postCode }: { postCode: string }) {
  return (
    <CarouselGenerator
      postCode={postCode}
      renderTrigger={({ onClick }) => (
        <button
          onClick={onClick}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg"
        >
          Gerar Carrossel
        </button>
      )}
    />
  );
}
```

## Troubleshooting

### Erro: Cannot find module '../Carousel-Template'

**Solução:** Verifique se a pasta está no local correto e os paths nos imports estão corretos.

```typescript
// Se Carousel-Template está na raiz do projeto
import { CarouselGenerator } from '../Carousel-Template';

// Se está dentro de src
import { CarouselGenerator } from './Carousel-Template';
```

### Erro: Module not found - lucide-react

**Solução:** Instale as dependências necessárias:

```bash
npm install lucide-react framer-motion
```

### Estilos não aparecem

**Solução:** Certifique-se de que o Tailwind CSS está configurado corretamente e inclui os arquivos do módulo no content.

### Erro de CORS ao buscar templates

**Solução:** Configure o CORS no seu servidor MinIO ou bucket S3 para permitir requisições do seu domínio.

## Próximos Passos

1. Explore a documentação completa no `README.md`
2. Personalize os estilos conforme a identidade visual do seu projeto
3. Adicione novos templates conforme necessário
4. Implemente tratamento de erros customizado
5. Adicione analytics/tracking se necessário
