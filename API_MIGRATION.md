# Migração para Nova API

## ✅ Arquivos Atualizados

### 1. `/src/config/api.ts`
- **Base URL**: Atualizada para `https://carousel-api-sepia.vercel.app/api`
- **Novos Endpoints**:
  - `POST /auth/login` - Login
  - `POST /auth/register` - Registro (novo)
  - `POST /auth/refresh` - Refresh token (novo)
  - `GET /user/profile` - Perfil do usuário
  - `POST /users/influencers` - Adicionar influenciador (novo)
  - `DELETE /users/influencers` - Remover influenciador (novo)
  - `GET /feed` - Obter feed
  - `POST /feed` - Criar feed (novo)
  - `POST /feed/save` - Salvar conteúdo (novo)
  - `DELETE /feed/save` - Remover conteúdo salvo (novo)

### 2. `/src/services/auth.ts`
**Mudanças:**
- ✅ Atualizado para usar `access_token` e `refresh_token` no lugar de `jwt_token`
- ✅ Adicionada função `refreshToken()` para renovar tokens expirados
- ✅ Adicionada função `getAuthHeaders()` para incluir Bearer token
- ✅ Validação de token agora verifica expiração e renova automaticamente
- ✅ Adicionada função `logout()` para limpar todos os tokens

**Novos tokens armazenados:**
- `access_token` - Token de acesso (expira em 1 hora)
- `refresh_token` - Token de renovação
- `token_expires_at` - Timestamp de expiração

### 3. `/src/services/feed.ts`
**Mudanças:**
- ✅ `GET /feed` - Buscar feed (antes era POST)
- ✅ Adicionada função `createFeed()` - Gera novo feed
- ✅ Adicionada função `saveContent(contentId)` - Salva conteúdo
- ✅ Adicionada função `unsaveContent(contentId)` - Remove conteúdo salvo
- ✅ Conversão automática do formato da API para o formato `Post` interno
- ✅ Usa `getAuthHeaders()` para autenticação

**Mapeamento de campos:**
```typescript
API → App
influencer_content.code → code
influencer_content.text → text
influencer_content.published_at → taken_at (convertido para timestamp)
influencer_id → username (temporário)
influencer_content.content_url → image_url
influencer_content.media_type → media_type
influencer_content.*_count → *_count
influencer_content.*_score → *Score
```

### 4. `/src/services/settings.ts`
**Mudanças:**
- ✅ `GET /user/profile` - Buscar perfil (antes era POST com token no body)
- ✅ `PUT /user/profile` - Atualizar perfil
- ✅ Usa `getAuthHeaders()` para autenticação
- ✅ Conversão automática do formato da API para `UserSettings`

**Mapeamento de campos:**
```typescript
API → App
business.name → business_name
business.website → business_website
business.instagram_username → business_instagram_username
```

## 🔄 Compatibilidade Retroativa

Para manter o código existente funcionando:
- `jwt_token` → `access_token` (mantida compatibilidade)
- `updateUserSetting(field, value)` → `updateUserSettings(updates)` (wrapper mantido)

## 🚀 Novas Funcionalidades Disponíveis

1. **Refresh de Tokens**: Tokens agora são renovados automaticamente quando expiram
2. **Salvar Conteúdo**: Usuários podem favoritar posts do feed
3. **Criar Feed**: Endpoint separado para forçar geração de novo feed
4. **Gerenciar Influenciadores**: API pronta para adicionar/remover influenciadores (endpoints disponíveis, UI não implementada)

## ⚠️ Notas Importantes

1. **Base URL**: Está definida em `/src/config/api.ts` - fácil de alterar no futuro
2. **Autenticação**: Agora usa Bearer Token no header `Authorization`
3. **Expiração**: Tokens expiram em 1 hora, mas são renovados automaticamente
4. **Cache**: Sistema de cache mantido funcionando com os novos endpoints
5. **Formato de Dados**: Conversão automática entre formato da API e formato interno

## 📋 Próximos Passos Sugeridos

1. Testar login com a nova API
2. Verificar se o feed carrega corretamente
3. Testar atualização de configurações
4. Implementar UI para gerenciar influenciadores (opcional)
5. Implementar funcionalidade de salvar/favoritar posts (opcional)

## 🔍 Debug

Para debugar problemas:
1. Abra o Console do navegador (F12)
2. Procure por logs começando com "Making login request", "Login API response", etc.
3. Verifique a aba Network para ver as requisições e respostas da API
4. Verifique localStorage para ver os tokens salvos
