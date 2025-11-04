# 📰 Página de Notícias

## Visão Geral

A página de Notícias exibe um feed personalizado de notícias baseado nos niches configurados pelo usuário. As notícias são obtidas através da API e podem ser filtradas por país e idioma.

## Estrutura de Arquivos

```
src/
├── pages/
│   └── NewsPage.tsx           # Página principal de notícias
├── components/
│   ├── NewsCard.tsx           # Card individual de notícia
│   └── NewsFilters.tsx        # Filtros de país e idioma
├── services/
│   └── news.ts                # Serviço de API para notícias
└── types/
    └── news.ts                # Tipos TypeScript para notícias
```

## Funcionalidades

### ✨ Features Principais

1. **Feed Personalizado**: Notícias baseadas nos niches do usuário
2. **Filtros Avançados**: 
   - Filtro por país (com bandeiras)
   - Filtro por idioma
   - Botão para limpar filtros
3. **Paginação**: Navegação entre páginas de notícias
4. **Cards Responsivos**: Layout em grade adaptável
5. **Estados Vazios**: Mensagens informativas quando não há notícias
6. **Loading States**: Indicador visual de carregamento

### 🎨 UI/UX

- **Design Consistente**: Segue o padrão visual do app (dark mode, purple accent)
- **Badges Informativos**: País, idioma e niche em destaque
- **Imagens Responsivas**: Aspect ratio 16:9 com hover effects
- **Links Externos**: Botão "Leia mais" que abre a notícia original
- **Timestamps Relativos**: "há 5 min", "há 2h", "há 3d", etc.

## API Integration

### Endpoint

```
GET /news
```

### Query Parameters

| Parâmetro | Tipo   | Obrigatório | Descrição                    |
|-----------|--------|-------------|------------------------------|
| page      | number | Não         | Número da página (default: 1)|
| limit     | number | Não         | Itens por página (default: 20)|
| nicheId   | string | Não         | Filtrar por niche específico |
| country   | string | Não         | Filtrar por país (ex: "BR")  |
| lang      | string | Não         | Filtrar por idioma (ex: "pt")|

### Resposta

```typescript
interface NewsResponse {
  success: boolean;
  data: NewsItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    countries: string[];  // Sempre retornado
    languages: string[];  // Sempre retornado
  };
}
```

## Componentes

### NewsPage

Componente principal que gerencia:
- Estado de notícias, filtros e paginação
- Chamadas à API
- Renderização de cards e controles

**Props:**
```typescript
interface NewsPageProps {
  unviewedCount?: number;  // Para badge de notificação (futuro)
}
```

### NewsCard

Card individual que exibe:
- Imagem da notícia
- Título e descrição
- Badge do niche
- Bandeira do país e código de idioma
- Timestamp relativo
- Link para notícia original

**Props:**
```typescript
interface NewsCardProps {
  news: NewsItem;
}
```

### NewsFilters

Componente de filtros que exibe:
- Select de países (com bandeiras emoji)
- Select de idiomas (com nomes traduzidos)
- Botão de limpar filtros

**Props:**
```typescript
interface NewsFiltersProps {
  filters: NewsFiltersType;
  selectedCountry: string;
  selectedLanguage: string;
  onCountryChange: (country: string) => void;
  onLanguageChange: (language: string) => void;
}
```

## Navegação

A página está integrada na navegação lateral:

```tsx
<Navigation currentPage="news" />
```

**Ícone:** Jornal (newspaper icon)
**Posição:** Entre Gallery e Settings
**Rota:** `/news`

## Tratamento de Erros

### Estados Possíveis

1. **Loading**: Barra de progresso no topo
2. **Vazio**: Mensagem amigável quando não há notícias
3. **Erro**: Card com mensagem de erro e botão "Tentar novamente"
4. **Sucesso**: Grid de notícias com paginação

### Mensagens de Erro

- "No authentication token found" → Usuário não autenticado
- "Unauthorized. Please login again." → Token expirado/inválido
- "Failed to fetch news" → Erro de rede ou servidor

## Futuras Melhorias

- [ ] Busca por palavra-chave
- [ ] Favoritar notícias
- [ ] Compartilhar notícias
- [ ] Notificações de novas notícias
- [ ] Filtro por data de publicação
- [ ] Modo de visualização (grid/lista)
- [ ] Infinite scroll (substituir paginação)
- [ ] Cache de notícias visitadas
- [ ] Histórico de leitura
- [ ] Gerar carrossel a partir de notícia

## Exemplos de Uso

### Carregar notícias básico

```typescript
const response = await getNews({ page: 1, limit: 20 });
```

### Com filtros

```typescript
const response = await getNews({
  page: 1,
  limit: 20,
  country: 'BR',
  lang: 'pt'
});
```

### Por niche específico

```typescript
const response = await getNews({
  nicheId: 'uuid-do-niche',
  page: 1
});
```

## Considerações Técnicas

### Performance

- Lazy loading de imagens
- Debounce em filtros (evita requests desnecessários)
- Limite de 20 itens por página (configurável)

### Acessibilidade

- Links semânticos (`<a>` para notícias externas)
- Botões desabilitados quando não aplicável
- Contraste adequado para leitura

### SEO

- Uso de tags semânticas (`<article>`, `<header>`, `<main>`)
- Meta tags dinâmicas (futuro)

## Testes

Para testar a página de notícias:

1. **Login**: Entre com um usuário que tenha niches configurados
2. **Navegação**: Clique no ícone de jornal na barra lateral
3. **Filtros**: Teste os filtros de país e idioma
4. **Paginação**: Navegue entre as páginas
5. **Links**: Clique em "Leia mais" para verificar os links externos

### Casos de Teste

- ✅ Usuário sem niches → Mensagem vazia
- ✅ Sem notícias para os filtros → Mensagem vazia
- ✅ Erro de rede → Mensagem de erro + retry
- ✅ Token inválido → Redirect para login
- ✅ Paginação correta → Botões desabilitados quando apropriado
- ✅ Filtros funcionando → Lista atualiza ao mudar filtros
