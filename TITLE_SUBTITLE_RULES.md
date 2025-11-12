# Regras para Títulos e Subtítulos em Carrosséis

## ⚠️ PROBLEMA IDENTIFICADO

Alguns slides estão sendo gerados com **DOIS TÍTULOS** (dois textos com o mesmo estilo de título principal), o que é **INCORRETO** e causa problemas visuais.

## ✅ ESTRUTURA CORRETA

### Hierarquia Obrigatória

Cada slide deve seguir esta estrutura:

```
┌─────────────────────────────────┐
│  📌 TÍTULO PRINCIPAL (title)    │  ← Grande, bold, destaque
│  📝 Subtítulo (subtitle)        │  ← Menor, normal, complementar
│  🖼️  Imagem/Vídeo de fundo      │
└─────────────────────────────────┘
```

### Regras de Ouro

1. **UM ÚNICO TÍTULO POR SLIDE**
   - Apenas um elemento deve ter estilo de título principal
   - Título = maior, bold, destaque visual

2. **SUBTÍTULO É OPCIONAL MAS DIFERENTE**
   - Se houver um segundo texto, ele DEVE ter estilo de subtítulo
   - Subtítulo = menor, peso normal, menos destaque

3. **ESTILOS VÊM DO TEMPLATE**
   - Os estilos de título e subtítulo são definidos no template HTML
   - NÃO podem ser alterados durante a renderização
   - O backend/IA apenas fornece o CONTEÚDO, não os estilos

## 🔧 ESTRUTURA TÉCNICA

### Template HTML (Exemplo Correto)

```html
<div class="slide">
  <h1 class="title" style="font-size: 48px; font-weight: bold; color: #fff;">
    {{title}}
  </h1>
  <p class="subtitle" style="font-size: 24px; font-weight: normal; color: #ddd;">
    {{subtitle}}
  </p>
  <div class="background" style="background-image: url({{bg}})"></div>
</div>
```

### Dados do Backend (Exemplo Correto)

```json
{
  "conteudos": [
    {
      "title": "Novidades em Inteligência Artificial",
      "subtitle": "Descubra as tendências de 2025",
      "imagem_fundo": "https://example.com/image.jpg"
    }
  ]
}
```

### ❌ ERRO COMUM: Title e Subtitle Iguais

```json
{
  "conteudos": [
    {
      "title": "Novidades em IA",
      "subtitle": "Novidades em IA",  // ❌ ERRO: Igual ao title!
      "imagem_fundo": "https://example.com/image.jpg"
    }
  ]
}
```

**Resultado**: Dois títulos idênticos aparecem no slide!

## 🛠️ CORREÇÕES IMPLEMENTADAS

### 1. Validação Automática

O sistema agora detecta quando `title === subtitle` e corrige automaticamente:

```typescript
if (conteudo.title && conteudo.subtitle && conteudo.title === conteudo.subtitle) {
  console.warn(`⚠️ AVISO: Slide tem title e subtitle IDÊNTICOS!`);
  console.warn(`   💡 CORREÇÃO: Usando apenas o title e limpando subtitle.`);
  conteudo.subtitle = ''; // Limpa o subtitle duplicado
}
```

### 2. Validação de Template

Verifica se o template HTML está correto:

```typescript
const titleCount = (templateHtml.match(/\{\{title\}\}/g) || []).length;
const subtitleCount = (templateHtml.match(/\{\{subtitle\}\}/g) || []).length;

if (titleCount > 1) {
  console.error(`❌ ERRO: Existem ${titleCount} placeholders {{title}}! Deve haver apenas 1.`);
}
```

## 📋 CHECKLIST PARA O BACKEND/IA

Quando gerar conteúdo para slides, verificar:

- [ ] `title` contém o texto principal (obrigatório)
- [ ] `subtitle` contém texto complementar OU está vazio (opcional)
- [ ] `title !== subtitle` (não podem ser iguais)
- [ ] `title` é mais importante/destaque que `subtitle`
- [ ] Se só há um texto, colocar apenas em `title` e deixar `subtitle` vazio

## 🎯 EXEMPLOS PRÁTICOS

### ✅ CORRETO: Um título

```json
{
  "title": "Inteligência Artificial em 2025",
  "subtitle": ""
}
```

### ✅ CORRETO: Título + Subtítulo diferentes

```json
{
  "title": "Inteligência Artificial em 2025",
  "subtitle": "As principais tendências do ano"
}
```

### ❌ INCORRETO: Textos iguais

```json
{
  "title": "Inteligência Artificial",
  "subtitle": "Inteligência Artificial"  // ❌ Duplicado!
}
```

### ❌ INCORRETO: Dois títulos no mesmo estilo

```html
<!-- Template ERRADO -->
<h1>{{title}}</h1>
<h1>{{subtitle}}</h1>  <!-- ❌ Ambos são h1! -->
```

### ✅ CORRETO: Hierarquia clara

```html
<!-- Template CORRETO -->
<h1 class="title">{{title}}</h1>
<p class="subtitle">{{subtitle}}</p>  <!-- ✅ Hierarquia correta -->
```

## 🚨 MENSAGENS DE ERRO

### Se você ver no console:

```
⚠️ AVISO: Slide 0 tem title e subtitle IDÊNTICOS!
```

**Causa**: Backend enviou dados com title === subtitle

**Solução**: Corrigir o backend para gerar textos diferentes ou deixar subtitle vazio

---

```
❌ ERRO NO TEMPLATE: Existem 2 placeholders {{title}}!
```

**Causa**: Template HTML tem mais de um {{title}}

**Solução**: Corrigir o template para ter apenas um {{title}}

## 📞 RESUMO PARA DESENVOLVEDORES

### Frontend (`templateRenderer.service.ts`)
- ✅ Valida dados duplicados
- ✅ Valida estrutura do template
- ✅ Corrige automaticamente title === subtitle
- ✅ Apenas substitui placeholders, NÃO altera estilos

### Backend/IA (Webhook de Geração)
- ⚠️ **DEVE** garantir que title ≠ subtitle
- ⚠️ **DEVE** usar subtitle apenas para texto complementar
- ⚠️ **PODE** deixar subtitle vazio se não houver segundo texto
- ⚠️ **NUNCA** duplicar o mesmo texto em ambos os campos

### Templates HTML
- ⚠️ **DEVE** ter apenas 1 placeholder {{title}}
- ⚠️ **PODE** ter 1 placeholder {{subtitle}} (opcional)
- ⚠️ **DEVE** definir estilos diferentes para title e subtitle
- ⚠️ **NUNCA** usar o mesmo estilo visual para ambos

---

**Data da última atualização**: 11 de novembro de 2025
