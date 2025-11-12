import { useNavigate } from 'react-router-dom';

interface NavigationProps {
  currentPage?: 'feed' | 'settings' | 'gallery' | 'news' | 'chatbot';
  onPageChange?: (page: 'feed' | 'settings' | 'gallery' | 'news' | 'chatbot') => void;
  unviewedCount?: number;
}

const Navigation: React.FC<NavigationProps> = ({ currentPage, onPageChange, unviewedCount = 0 }) => {
  const navigate = useNavigate();

  const handlePageChange = (page: 'feed' | 'settings' | 'gallery' | 'news' | 'chatbot') => {
    if (onPageChange) {
      onPageChange(page);
    }

    // Atualiza a URL baseado na página
    switch (page) {
      case 'feed':
        navigate('/');
        break;
      case 'gallery':
        navigate('/gallery');
        break;
      case 'news':
        navigate('/news');
        break;
      case 'chatbot':
        navigate('/chatbot');
        break;
      case 'settings':
        navigate('/settings');
        break;
    }
  };
  return (
    <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-16 bg-black/90 backdrop-blur-lg border-r border-white/10 z-50 flex-col items-center py-8">
      <div className="flex flex-col items-center space-y-8 py-10">
        {/* Feed */}
        <button
          onClick={() => handlePageChange('feed')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'feed'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-grid w-6 h-6"
          >
            <rect width="7" height="7" x="3" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="3" rx="1" />
            <rect width="7" height="7" x="14" y="14" rx="1" />
            <rect width="7" height="7" x="3" y="14" rx="1" />
          </svg>
        </button>

        {/* News */}
        <button
          onClick={() => handlePageChange('news')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'news'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-newspaper w-6 h-6"
          >
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" />
            <path d="M15 18h-5" />
            <path d="M10 6h8v4h-8V6Z" />
          </svg>
        </button>

        {/* Create Carousel / ChatBot */}
        <button
          onClick={() => navigate('/create-carousel')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'chatbot'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-plus-circle w-6 h-6"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        </button>

                {/* Gallery */}
        <button
          onClick={() => handlePageChange('gallery')}
          className={`relative p-3 rounded-lg transition-colors ${
            currentPage === 'gallery'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-image w-6 h-6"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          {unviewedCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unviewedCount}
            </span>
          )}
        </button>

        {/* Settings */}
        <button
          onClick={() => handlePageChange('settings')}
          className={`p-3 rounded-lg transition-colors ${
            currentPage === 'settings'
              ? 'bg-white/10 text-white'
              : 'text-white/60 hover:text-white/90 hover:bg-white/5'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-settings w-6 h-6"
          >
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      </div>
    </nav>
  );
};

export default Navigation;