#!/bin/bash

# Script de Migração do Carousel-Template para src/

echo "🚀 Iniciando migração do Carousel-Template..."

# Criar estrutura final de utilitários
echo "📦 Criando arquivos de índice..."

# Utils index
cat > /workspaces/carrossel-de-cria/src/utils/carousel/index.ts << 'EOF'
export * from './logger';
export * from './media';
export * from './math';
export * from './dom';
EOF

# Services index
cat > /workspaces/carrossel-de-cria/src/services/carousel/index.ts << 'EOF'
export * from './carousel.service';
export * from './template.service';
export * from './templateRenderer.service';
EOF

# Hooks index
cat > /workspaces/carrossel-de-cria/src/hooks/carousel/index.ts << 'EOF'
export * from './useCarousel';
EOF

# Components carousel index  
cat > /workspaces/carrossel-de-cria/src/components/carousel/index.ts << 'EOF'
export { default as CarouselGenerator } from './CarouselGenerator';
export { default as CarouselEditorTabs } from './CarouselEditorTabs';
export { default as TemplateSelectionModal } from './TemplateSelectionModal';
export { default as GenerationQueue } from './GenerationQueue';
export { default as CarouselViewer } from './viewer/CarouselViewer';

export type { CarouselTab } from './CarouselEditorTabs';
EOF

echo "✅ Migração base concluída!"
echo "⚠️  Próximo passo: Atualizar imports e refatorar CarouselViewer"
