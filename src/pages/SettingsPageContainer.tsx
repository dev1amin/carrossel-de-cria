import { useNavigate } from 'react-router-dom';
import SettingsPage from '../components/SettingsPage';

const SettingsPageContainer = () => {
  const navigate = useNavigate();

  return (
    <SettingsPage
      onPageChange={(page: 'feed' | 'settings' | 'gallery') => {
        switch (page) {
          case 'feed':
            navigate('/');
            break;
          case 'settings':
            navigate('/settings');
            break;
          case 'gallery':
            navigate('/gallery');
            break;
        }
      }}
      setIsLoading={() => {}}
    />
  );
};

export default SettingsPageContainer;