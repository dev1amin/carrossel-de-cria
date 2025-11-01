import React from 'react'
import Header from './Header'

interface CarouselEditorProps {
  children: React.ReactNode
}

const CarouselEditor: React.FC<CarouselEditorProps> = ({ children }) => {
  return (
    <div className="flex flex-col h-screen bg-black">
      {/* Header fixo no topo */}
      <Header onSearch={() => {}} activeSort="latest" onSortChange={() => {}} />
      
      {/* Navegação na lateral */}
      <div className="flex flex-1 overflow-hidden">
        {/* Barra de navegação (injetada pelo Navigation.tsx) */}
        
        {/* Conteúdo principal */}
        <main className="flex-1 overflow-y-auto pt-14">
          {children}
        </main>
      </div>
    </div>
  )
}

export default CarouselEditor