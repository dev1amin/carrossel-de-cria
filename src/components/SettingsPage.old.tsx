import React, { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, LogOut, Edit2, Check, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from './Navigation';
import { getUserSettings, updateBusinessField } from '../services/settings';
import { UserSettings } from '../types/settings';

interface EditableField {
  name: string;
  value: string;
  isEditing: boolean;
  apiField: 'name' | 'website' | 'instagram_username' | 'tone_of_voice';
  validate?: (value: string) => string | null;
}

interface SettingsPageProps {
  onPageChange: (page: 'feed' | 'settings') => void;
  setIsLoading: (loading: boolean) => void;
}

const validateUrl = (url: string): string | null => {
  if (!url) return null;
  try {
    new URL(url.startsWith('http') ? url : `https://${url}`);
    return null;
  } catch {
    return 'Please enter a valid URL';
  }
};

const SettingsPage: React.FC<SettingsPageProps> = ({ onPageChange, setIsLoading }) => {
  const [expandedSection, setExpandedSection] = useState<'business' | 'personal' | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, EditableField>>({
    businessName: { 
      name: 'Business Name', 
      value: '', 
      isEditing: false,
      apiField: 'name'
    },
    instagram: { 
      name: 'Instagram', 
      value: '', 
      isEditing: false,
      apiField: 'instagram_username'
    },
    website: { 
      name: 'Website', 
      value: '', 
      isEditing: false,
      apiField: 'website',
      validate: validateUrl
    },
    toneOfVoice: {
      name: 'Tone of Voice',
      value: '',
      isEditing: false,
      apiField: 'tone_of_voice'
    }
  });

  const loadUserSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settings = await getUserSettings();
      setUserSettings(settings);
      
      setFields({
        businessName: { 
          name: 'Business Name', 
          value: settings.business?.name || '', 
          isEditing: false,
          apiField: 'name'
        },
        instagram: { 
          name: 'Instagram', 
          value: settings.business?.instagram_username || '', 
          isEditing: false,
          apiField: 'instagram_username'
        },
        website: { 
          name: 'Website', 
          value: settings.business?.website || '', 
          isEditing: false,
          apiField: 'website',
          validate: validateUrl
        },
        toneOfVoice: {
          name: 'Tone of Voice',
          value: settings.business?.tone_of_voice || '',
          isEditing: false,
          apiField: 'tone_of_voice'
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setIsPageLoading(false);
      setIsLoading(false);
    }
  }, [setIsLoading]);

  useEffect(() => {
    loadUserSettings();
  }, [loadUserSettings]);

  const handleSaveField = async (fieldKey: string) => {
    const field = fields[fieldKey];
    
    if (field.validate) {
      const error = field.validate(field.value);
      if (error) {
        setValidationErrors(prev => ({ ...prev, [fieldKey]: error }));
        return;
      }
    }

    setIsLoading(true);
    try {
      let value = field.value;
      if (field.apiField === 'website' && value && !value.startsWith('http')) {
        value = `https://${value}`;
      }
      
      await updateBusinessField(field.apiField, value);
      toggleEdit(fieldKey);
      
      // Recarregar settings para atualizar o cache
      await loadUserSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setIsLoading(false);
    }
  };

  const updateField = (fieldKey: string, value: string) => {
    setFields(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        value,
      }
    }));
    setValidationErrors(prev => ({ ...prev, [fieldKey]: '' }));
  };

  const handleNicheSelect = async (niche: Niche) => {
    if (!niche.access) {
      setShowPurchasePopup(true);
      setTimeout(() => setShowPurchasePopup(false), 3000);
      return;
    }

    if (niche.id === currentNicheId) {
      setIsNicheDropdownOpen(false);
      setNicheSearch('');
      return;
    }

    setIsLoading(true);
    try {
      await updateUserSetting('current_feed_niche', niche.id);
      setSelectedNiche(niche.name);
      setCurrentNicheId(niche.id);
      setIsNicheDropdownOpen(false);
      setNicheSearch('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update niche');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateNewNiche = () => {
    setShowPurchasePopup(true);
    setTimeout(() => setShowPurchasePopup(false), 3000);
  };

  const handleLogout = () => {
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const toggleSection = (section: 'business' | 'personal') => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const renderField = (fieldKey: string, multiline: boolean = false) => {
    const field = fields[fieldKey];
    const validationError = validationErrors[fieldKey];
    
    return (
      <div className="flex items-start justify-between py-2">
        <div className="flex-1">
          <div className="text-sm text-gray-400">{field.name}</div>
          {field.isEditing ? (
            <div className="space-y-2">
              {multiline ? (
                <textarea
                  value={field.value}
                  onChange={(e) => updateField(fieldKey, e.target.value)}
                  className="w-full bg-transparent text-white focus:outline-none resize-none mt-1"
                  rows={4}
                  autoFocus
                />
              ) : (
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => updateField(fieldKey, e.target.value)}
                  className="w-full bg-transparent text-white focus:outline-none mt-1"
                  autoFocus
                />
              )}
              {validationError && (
                <p className="text-red-500 text-sm">{validationError}</p>
              )}
            </div>
          ) : (
            <div className="text-white mt-1">
              {field.value || <span className="text-gray-500">Not set</span>}
            </div>
          )}
        </div>
        <button
          onClick={() => field.isEditing ? handleSaveField(fieldKey) : toggleEdit(fieldKey)}
          className="ml-4 text-gray-400 hover:text-white transition-colors"
        >
          {field.isEditing ? (
            <Check className="w-4 h-4" />
          ) : (
            <Edit2 className="w-4 h-4" />
          )}
        </button>
      </div>
    );
  };

  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-4">
        <div className="container mx-auto">
          <div className="flex items-center mb-8">
            <button onClick={() => onPageChange('feed')} className="text-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-semibold ml-4">Settings</h1>
          </div>
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <p className="text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Main Header */}
      <header className="fixed top-0 left-0 right-0 bg-black h-14 z-[100] shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex items-center h-14">
            <img
              src="https://cdn.prod.website-files.com/665825f3f5168cb68f2c36e1/6662ca6f1be62e26c76ef652_workezLogoWebp.webp"
              alt="Workez Logo"
              className="h-5"
            />
          </div>
        </div>
      </header>
      
      {/* Flex container for Navigation and Content */}
      <div className="flex flex-1 mt-14 overflow-hidden">
        {/* Navigation */}
        <Navigation currentPage="settings" unviewedCount={0} />
        
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4">
            {/* Settings Header */}
            <div className="py-4 flex items-center">
              <button 
                className="text-white"
                onClick={() => onPageChange('feed')}
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-xl font-semibold ml-4">Settings</h1>
            </div>

            {/* Purchase Popup */}
            <AnimatePresence>
              {showPurchasePopup && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="fixed top-4 right-4 bg-white text-black px-6 py-4 rounded-lg shadow-lg z-50"
                >
                  You'll be able to purchase it soon...
                </motion.div>
              )}
            </AnimatePresence>

            {/* Niche Section */}
            <section className="mb-8">
              <h3 className="text-sm font-medium text-gray-400 mb-1">Spying Niche</h3>
              <div className="relative">
                <button
                  onClick={() => setIsNicheDropdownOpen(!isNicheDropdownOpen)}
                  className="w-full flex items-start justify-between bg-transparent py-2"
                >
                  <div>
                    <h1 className="text-2xl font-bold">{selectedNiche || 'Select a niche'}</h1>
                  </div>
                  <ChevronDown className={`w-5 h-5 transition-transform ${isNicheDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isNicheDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg overflow-hidden z-50"
                    >
                      <div className="p-2">
                        <div className="relative mb-2">
                          <input
                            type="text"
                            value={nicheSearch}
                            onChange={(e) => setNicheSearch(e.target.value)}
                            placeholder="Search niches..."
                            className="w-full bg-gray-100 text-gray-900 pl-8 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-300"
                          />
                          <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                          {filteredNiches.map((niche) => (
                            <button
                              key={niche.id}
                              onClick={() => handleNicheSelect(niche)}
                              className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors ${
                                currentNicheId === niche.id
                                  ? 'bg-gray-100 font-bold'
                                  : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-center">
                                {niche.access ? (
                                  <Check className="w-4 h-4 text-gray-600 mr-2" />
                                ) : (
                                  <Lock className="w-4 h-4 text-gray-400 mr-2" />
                                )}
                                <span className="text-gray-900">{niche.name}</span>
                              </div>
                              {!niche.access && (
                                <span className="text-sm font-medium text-gray-900">${niche.price}</span>
                              )}
                            </button>
                          ))}
                          
                          {/* Create New Niche Button */}
                          <button
                            onClick={handleCreateNewNiche}
                            className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between transition-colors hover:bg-gray-50 border-t border-gray-200"
                          >
                            <div className="flex items-center">
                              <Plus className="w-4 h-4 text-gray-600 mr-2" />
                              <span className="text-gray-900">Create New Niche</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">$7</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Business Info Section */}
            <div className="border-t border-white/10">
              <button
                onClick={() => toggleSection('business')}
                className="w-full py-4 flex items-center justify-between text-left"
              >
                <span className="text-lg font-semibold">Business Info</span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedSection === 'business' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {expandedSection === 'business' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pb-4">
                      {renderField('businessName')}
                      {renderField('instagram')}
                      {renderField('website')}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Personal Info Section */}
            <div className="border-t border-white/10">
              <button
                onClick={() => toggleSection('personal')}
                className="w-full py-4 flex items-center justify-between text-left"
              >
                <span className="text-lg font-semibold">Personal Info</span>
                <ChevronDown
                  className={`w-5 h-5 text-gray-400 transition-transform ${
                    expandedSection === 'personal' ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <AnimatePresence>
                {expandedSection === 'personal' && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pb-4">
                      <div className="py-2">
                        <div className="text-sm text-gray-400">Name</div>
                        <div className="text-white mt-1">{userSettings?.name}</div>
                      </div>
                      <div className="py-2">
                        <div className="text-sm text-gray-400">Email</div>
                        <div className="text-white mt-1">{userSettings?.email}</div>
                      </div>
                      <button 
                        onClick={handleLogout}
                        className="w-full flex items-center py-2 text-red-500"
                      >
                        <LogOut className="w-5 h-5 mr-2" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;