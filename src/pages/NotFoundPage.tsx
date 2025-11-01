import { useNavigate } from 'react-router-dom';

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="space-y-4">
          <h1 className="text-9xl font-bold text-white">404</h1>
          <h2 className="text-2xl font-semibold text-white">Página não encontrada</h2>
          <p className="text-zinc-400">
            Desculpe, não conseguimos encontrar a página que você está procurando.
          </p>
        </div>
        
        <div className="flex flex-col space-y-4">
          <button
            onClick={() => navigate('/')}
            className="w-full px-4 py-3 text-white bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            Voltar para o Feed
          </button>
          <button
            onClick={() => navigate(-1)}
            className="w-full px-4 py-3 text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Voltar para página anterior
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;