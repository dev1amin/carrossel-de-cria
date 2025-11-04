# 🎨 Generated Content API - Documentação de Uso

## Visão Geral

Sistema completo para gerenciar conteúdos gerados por IA (carrosséis, reels, etc.) com filtros, paginação e estatísticas.

## 📁 Estrutura de Arquivos

```
src/
├── config/
│   └── api.ts                           # Endpoints configurados
├── types/
│   └── generatedContent.ts              # Tipos TypeScript
├── services/
│   └── generatedContent.ts              # Serviços de API
└── hooks/
    └── useGeneratedContent.ts           # Hook customizado
```

## 🔌 Endpoints Configurados

### 1. Listar Conteúdos Gerados
```typescript
GET /api/generated-content
```

### 2. Buscar por ID
```typescript
GET /api/generated-content/:id
```

### 3. Estatísticas
```typescript
GET /api/generated-content/stats
```

## 📦 Tipos TypeScript

```typescript
interface GeneratedContent {
  id: number;
  user_id: string;
  content_id: number;
  media_type: string;
  provider_type: string;
  result: GeneratedContentResult;
  created_at: string;
  status: 'pending' | 'completed' | 'failed';
  completed_at?: string;
  influencer_content: GeneratedContentSource;
}

interface GeneratedContentStats {
  total: number;
  by_status: {
    completed: number;
    pending: number;
    failed: number;
  };
  by_media_type: Record<string, number>;
  by_provider: Record<string, number>;
}
```

## 🎯 Como Usar

### Opção 1: Hook Customizado (Recomendado)

```tsx
import { useGeneratedContent } from '../hooks/useGeneratedContent';

function MyComponent() {
  const {
    content,
    stats,
    isLoading,
    error,
    pagination,
    loadContent,
    refresh
  } = useGeneratedContent(true, { page: 1, limit: 20 });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Total: {stats?.total}</h1>
      {content.map(item => (
        <div key={item.id}>
          <h3>{item.media_type}</h3>
          <p>Status: {item.status}</p>
        </div>
      ))}
    </div>
  );
}
```

### Opção 2: Serviços Diretos

```tsx
import {
  getGeneratedContent,
  getGeneratedContentById,
  getGeneratedContentStats
} from '../services/generatedContent';

// Listar todos
const response = await getGeneratedContent({
  page: 1,
  limit: 20,
  media_type: 'carousel'
});

// Buscar por ID
const item = await getGeneratedContentById(123);

// Estatísticas
const stats = await getGeneratedContentStats();
console.log('Total:', stats.data.total);
console.log('Completed:', stats.data.by_status.completed);
```

## 🔍 Exemplos de Filtros

### Filtrar por Tipo de Mídia
```tsx
loadContent({ media_type: 'carousel' });
```

### Filtrar por Provider
```tsx
loadContent({ provider_type: 'openai' });
```

### Paginação
```tsx
loadContent({ page: 2, limit: 50 });
```

### Combinar Filtros
```tsx
loadContent({
  page: 1,
  limit: 20,
  media_type: 'carousel',
  provider_type: 'anthropic'
});
```

## 📊 Exemplo: Componente de Dashboard

```tsx
import React from 'react';
import { useGeneratedContent } from '../hooks/useGeneratedContent';

const GeneratedContentDashboard: React.FC = () => {
  const {
    content,
    stats,
    isLoading,
    error,
    pagination,
    loadContent,
  } = useGeneratedContent(true);

  const handlePageChange = (page: number) => {
    loadContent({ page, limit: 20 });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500 rounded-lg p-4">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/5 rounded-lg p-4">
            <h3 className="text-white/60 text-sm">Total</h3>
            <p className="text-white text-2xl font-bold">{stats.total}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4">
            <h3 className="text-green-300 text-sm">Completed</h3>
            <p className="text-white text-2xl font-bold">
              {stats.by_status.completed}
            </p>
          </div>
          <div className="bg-yellow-500/10 rounded-lg p-4">
            <h3 className="text-yellow-300 text-sm">Pending</h3>
            <p className="text-white text-2xl font-bold">
              {stats.by_status.pending}
            </p>
          </div>
        </div>
      )}

      {/* Content List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {content.map(item => (
          <div
            key={item.id}
            className="bg-white/5 rounded-lg p-4 border border-white/10"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-purple-400 text-sm font-semibold">
                {item.media_type}
              </span>
              <span className="text-white/60 text-xs">
                {item.provider_type}
              </span>
            </div>
            <p className="text-white/80 text-sm mb-2">
              {item.influencer_content.influencer.display_name}
            </p>
            <p className="text-white/40 text-xs">
              {new Date(item.created_at).toLocaleDateString('pt-BR')}
            </p>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handlePageChange(pagination.page - 1)}
            disabled={pagination.page === 1}
            className="px-4 py-2 bg-white/5 rounded-lg text-white disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-white/60">
            Página {pagination.page} de {pagination.totalPages}
          </span>
          <button
            onClick={() => handlePageChange(pagination.page + 1)}
            disabled={pagination.page === pagination.totalPages}
            className="px-4 py-2 bg-white/5 rounded-lg text-white disabled:opacity-50"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
};

export default GeneratedContentDashboard;
```

## 🔐 Autenticação

Todos os endpoints requerem autenticação via Bearer token:

```typescript
Headers: {
  Authorization: "Bearer {access_token}"
}
```

O token é automaticamente recuperado do `localStorage` pelos serviços.

## ⚠️ Tratamento de Erros

```typescript
try {
  const response = await getGeneratedContent();
  // Sucesso
} catch (error) {
  if (error.message.includes('Unauthorized')) {
    // Redirecionar para login
  } else if (error.message.includes('not found')) {
    // Mostrar 404
  } else {
    // Erro genérico
  }
}
```

## 📝 Notas Importantes

1. **Apenas conteúdos completados**: O endpoint `/generated-content` retorna apenas itens com `status='completed'`
2. **Paginação padrão**: Default é 20 itens por página (máx: 100)
3. **Filtros opcionais**: Todos os filtros são opcionais
4. **Cache**: Considere implementar cache para as estatísticas (mudam com menos frequência)

## 🚀 Próximos Passos

- [ ] Implementar cache de estatísticas
- [ ] Adicionar filtro por data
- [ ] Implementar busca por texto
- [ ] Adicionar exportação de dados
- [ ] Criar visualizações de gráficos

## ✅ Status

**Implementação Completa:**
- ✅ Endpoints configurados
- ✅ Tipos TypeScript definidos
- ✅ Serviços de API criados
- ✅ Hook customizado implementado
- ✅ Documentação completa
- ✅ Exemplos de uso fornecidos
