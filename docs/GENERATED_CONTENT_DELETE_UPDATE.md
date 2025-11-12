# Funções de Delete e Update do Generated Content

Este documento descreve como usar as novas funções `deleteGeneratedContent` e `updateGeneratedContent`.

## Delete Generated Content

Deleta um conteúdo gerado específico do usuário.

### Uso Básico

```typescript
import { deleteGeneratedContent } from '../services/generatedContent';

// Deletar um carrossel
const handleDelete = async (contentId: number) => {
  try {
    const response = await deleteGeneratedContent(contentId);
    console.log(response.message); // "Generated content deleted successfully"
    
    // Recarregar lista após deletar
    await loadGeneratedContent();
  } catch (error) {
    console.error('Erro ao deletar:', error.message);
    // Exibir toast de erro para o usuário
  }
};
```

### Resposta de Sucesso

```typescript
{
  success: true,
  message: "Generated content deleted successfully"
}
```

### Erros Possíveis

- **404**: Conteúdo não encontrado ou não pertence ao usuário
- **500**: Erro ao deletar o conteúdo
- **401**: Token de autenticação inválido

### Exemplo em Componente React

```tsx
import React, { useState } from 'react';
import { deleteGeneratedContent } from '../services/generatedContent';
import { Trash2 } from 'lucide-react';

const CarouselCard: React.FC<{ carouselId: number; onDelete: () => void }> = ({ 
  carouselId, 
  onDelete 
}) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Tem certeza que deseja deletar este carrossel?')) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteGeneratedContent(carouselId);
      onDelete(); // Callback para atualizar a lista
    } catch (error) {
      alert('Erro ao deletar: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="text-red-500 hover:text-red-700"
    >
      <Trash2 className="w-5 h-5" />
      {isDeleting && <span>Deletando...</span>}
    </button>
  );
};
```

---

## Update Generated Content

Atualiza o campo `result` (JSONB) de um conteúdo gerado. Útil para salvar edições feitas no carrossel.

### Uso Básico

```typescript
import { updateGeneratedContent } from '../services/generatedContent';

// Atualizar slides do carrossel
const handleSaveEdits = async (contentId: number, editedSlides: any[]) => {
  try {
    const response = await updateGeneratedContent(contentId, {
      result: {
        slides: editedSlides,
        metadata: {
          version: '2.0',
          edited: true,
          lastEditedAt: new Date().toISOString()
        }
      }
    });
    
    console.log('Atualizado com sucesso!', response.data);
  } catch (error) {
    console.error('Erro ao atualizar:', error.message);
  }
};
```

### Request Body

```typescript
{
  result: {
    slides: [
      {
        title: "Novo título",
        content: "Novo conteúdo",
        image_url: "https://...",
        // ... outros campos
      }
    ],
    metadata: {
      version: "2.0",
      edited: true,
      // ... outros metadados
    }
  }
}
```

### Resposta de Sucesso

```typescript
{
  success: true,
  message: "Generated content updated successfully",
  data: {
    id: 1,
    user_id: "uuid",
    content_id: 123,
    media_type: "carousel",
    provider_type: "openai",
    result: {
      slides: [...],
      metadata: {...}
    },
    created_at: "2025-11-03T10:00:00Z",
    status: "completed",
    completed_at: "2025-11-03T10:05:00Z"
  }
}
```

### Erros Possíveis

- **400**: Campo result inválido ou ausente
- **404**: Conteúdo não encontrado ou não pertence ao usuário
- **500**: Erro ao atualizar o conteúdo
- **401**: Token de autenticação inválido

### Exemplo em Editor de Carrossel

```tsx
import React, { useState, useEffect } from 'react';
import { 
  getGeneratedContentById, 
  updateGeneratedContent 
} from '../services/generatedContent';
import { Save } from 'lucide-react';

const CarouselEditor: React.FC<{ carouselId: number }> = ({ carouselId }) => {
  const [slides, setSlides] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    loadCarousel();
  }, [carouselId]);

  const loadCarousel = async () => {
    try {
      const response = await getGeneratedContentById(carouselId);
      setSlides(response.data.result.slides || []);
    } catch (error) {
      console.error('Erro ao carregar:', error);
    }
  };

  const handleSlideEdit = (index: number, field: string, value: any) => {
    const newSlides = [...slides];
    newSlides[index] = {
      ...newSlides[index],
      [field]: value
    };
    setSlides(newSlides);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateGeneratedContent(carouselId, {
        result: {
          slides,
          metadata: {
            version: '2.0',
            edited: true,
            lastEditedAt: new Date().toISOString()
          }
        }
      });
      setHasUnsavedChanges(false);
      alert('Carrossel salvo com sucesso!');
    } catch (error) {
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      {/* Editor UI */}
      {slides.map((slide, index) => (
        <div key={index}>
          <input
            value={slide.title}
            onChange={(e) => handleSlideEdit(index, 'title', e.target.value)}
          />
          {/* ... mais campos */}
        </div>
      ))}

      {/* Botão de salvar */}
      <button
        onClick={handleSave}
        disabled={!hasUnsavedChanges || isSaving}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        <Save className="w-4 h-4 inline mr-2" />
        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
      </button>
    </div>
  );
};
```

---

## Boas Práticas

### 1. Confirmação antes de deletar

Sempre peça confirmação antes de deletar um conteúdo:

```typescript
const handleDelete = async (id: number) => {
  const confirmed = window.confirm(
    'Tem certeza que deseja deletar este carrossel? Esta ação não pode ser desfeita.'
  );
  
  if (!confirmed) return;
  
  try {
    await deleteGeneratedContent(id);
    // Atualizar UI
  } catch (error) {
    // Tratar erro
  }
};
```

### 2. Indicador de mudanças não salvas

Avise o usuário sobre mudanças não salvas:

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      e.returnValue = '';
    }
  };

  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [hasUnsavedChanges]);
```

### 3. Validação do result antes de enviar

Valide a estrutura do `result` antes de enviar:

```typescript
const validateResult = (result: any): boolean => {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  if (!Array.isArray(result.slides)) {
    return false;
  }
  
  return result.slides.every((slide: any) => 
    slide.title && slide.content
  );
};

const handleSave = async () => {
  const result = { slides, metadata };
  
  if (!validateResult(result)) {
    alert('Dados inválidos. Verifique se todos os slides têm título e conteúdo.');
    return;
  }
  
  await updateGeneratedContent(carouselId, { result });
};
```

### 4. Debounce para auto-save

Implemente auto-save com debounce para não sobrecarregar a API:

```typescript
import { useEffect, useRef } from 'react';

const useAutoSave = (data: any, saveFunction: () => Promise<void>, delay = 2000) => {
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      saveFunction();
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data]);
};

// Uso
const CarouselEditor = () => {
  const [slides, setSlides] = useState([]);
  
  const autoSave = async () => {
    await updateGeneratedContent(carouselId, {
      result: { slides }
    });
  };

  useAutoSave(slides, autoSave, 3000); // Auto-save após 3s de inatividade
  
  // ...
};
```

---

## Tratamento de Erros

### Exemplo Completo com Toast

```typescript
import { useState } from 'react';
import { updateGeneratedContent, deleteGeneratedContent } from '../services/generatedContent';

const useGeneratedContentActions = () => {
  const [toast, setToast] = useState<{type: 'success' | 'error', message: string} | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const updateContent = async (id: number, result: any) => {
    try {
      await updateGeneratedContent(id, { result });
      showToast('success', 'Carrossel atualizado com sucesso!');
      return true;
    } catch (error) {
      const message = error instanceof Error 
        ? error.message 
        : 'Erro ao atualizar carrossel';
      showToast('error', message);
      return false;
    }
  };

  const deleteContent = async (id: number) => {
    try {
      await deleteGeneratedContent(id);
      showToast('success', 'Carrossel deletado com sucesso!');
      return true;
    } catch (error) {
      const message = error instanceof Error 
        ? error.message 
        : 'Erro ao deletar carrossel';
      showToast('error', message);
      return false;
    }
  };

  return { updateContent, deleteContent, toast };
};

export default useGeneratedContentActions;
```
