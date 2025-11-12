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
  apiField: 'name' | 'website' | 'instagram_username' | 'main_objective' | 'mission_short' | 'writing_notes' | 
    'tone_formality' | 'tone_emotion' | 'tone_rhythm' | 'language_code' | 'keywords_must' | 'keywords_avoid';
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
  const [originalValues, setOriginalValues] = useState<Record<string, string>>({});
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
    mainObjective: {
      name: 'Main Objective',
      value: '',
      isEditing: false,
      apiField: 'main_objective'
    },
    missionShort: {
      name: 'Mission (Short)',
      value: '',
      isEditing: false,
      apiField: 'mission_short'
    },
    writingNotes: {
      name: 'Writing Notes',
      value: '',
      isEditing: false,
      apiField: 'writing_notes'
    }
  });

  const loadUserSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const settings = await getUserSettings();
      setUserSettings(settings);
      
      // Store original values for comparison
      const originals: Record<string, string> = {
        name: settings.business?.name || '',
        instagram_username: settings.business?.instagram_username || '',
        website: settings.business?.website || '',
        main_objective: settings.business?.main_objective || '',
        mission_short: settings.business?.mission_short || '',
        writing_notes: settings.business?.writing_notes || '',
        tone_formality: settings.business?.tone_formality || 'neutral',
        tone_emotion: settings.business?.tone_emotion || 'balanced',
        tone_rhythm: settings.business?.tone_rhythm || 'fluid',
        language_code: settings.business?.language_code || 'pt',
        keywords_must: settings.business?.keywords_must ? settings.business.keywords_must.join(', ') : '',
        keywords_avoid: settings.business?.keywords_avoid ? settings.business.keywords_avoid.join(', ') : '',
      };
      setOriginalValues(originals);
      
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
        mainObjective: {
          name: 'Main Objective',
          value: settings.business?.main_objective || '',
          isEditing: false,
          apiField: 'main_objective'
        },
        missionShort: {
          name: 'Mission (Short)',
          value: settings.business?.mission_short || '',
          isEditing: false,
          apiField: 'mission_short'
        },
        writingNotes: {
          name: 'Writing Notes',
          value: settings.business?.writing_notes || '',
          isEditing: false,
          apiField: 'writing_notes'
        },
        tone_formality: {
          name: 'Tone Formality',
          value: settings.business?.tone_formality || 'neutral',
          isEditing: false,
          apiField: 'tone_formality'
        },
        tone_emotion: {
          name: 'Tone Emotion',
          value: settings.business?.tone_emotion || 'balanced',
          isEditing: false,
          apiField: 'tone_emotion'
        },
        tone_rhythm: {
          name: 'Tone Rhythm',
          value: settings.business?.tone_rhythm || 'fluid',
          isEditing: false,
          apiField: 'tone_rhythm'
        },
        language_code: {
          name: 'Language',
          value: settings.business?.language_code || 'pt',
          isEditing: false,
          apiField: 'language_code'
        },
        keywords_must: {
          name: 'Keywords (Must)',
          value: settings.business?.keywords_must ? settings.business.keywords_must.join(', ') : '',
          isEditing: false,
          apiField: 'keywords_must'
        },
        keywords_avoid: {
          name: 'Keywords (Avoid)',
          value: settings.business?.keywords_avoid ? settings.business.keywords_avoid.join(', ') : '',
          isEditing: false,
          apiField: 'keywords_avoid'
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

  const toggleEdit = (fieldKey: string) => {
    setFields(prev => ({
      ...prev,
      [fieldKey]: {
        ...prev[fieldKey],
        isEditing: !prev[fieldKey].isEditing,
      }
    }));
    setValidationErrors(prev => ({ ...prev, [fieldKey]: '' }));
  };

  const handleSaveField = async (fieldKey: string) => {
    const field = fields[fieldKey];
    
    // Check if value actually changed
    if (field.value === originalValues[field.apiField]) {
      // No change, just toggle edit mode
      toggleEdit(fieldKey);
      return;
    }
    
    if (field.validate) {
      const error = field.validate(field.value);
      if (error) {
        setValidationErrors(prev => ({ ...prev, [fieldKey]: error }));
        return;
      }
    }

    setIsLoading(true);
    try {
      let value: string | string[] = field.value;
      
      // Transformar campos específicos
      if (field.apiField === 'website' && value && !value.startsWith('http')) {
        value = `https://${value}`;
      }
      
      // Converter arrays de keywords de string para array
      if (field.apiField === 'keywords_must' || field.apiField === 'keywords_avoid') {
        value = value 
          ? value.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
      }
      
      // Validar enums
      if (field.apiField === 'tone_formality') {
        if (!['formal', 'neutral', 'informal'].includes(value as string)) {
          setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Must be: formal, neutral, or informal' }));
          setIsLoading(false);
          return;
        }
      }
      
      if (field.apiField === 'tone_emotion') {
        if (!['rational', 'balanced', 'emotional'].includes(value as string)) {
          setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Must be: rational, balanced, or emotional' }));
          setIsLoading(false);
          return;
        }
      }
      
      if (field.apiField === 'tone_rhythm') {
        if (!['direct', 'fluid', 'narrative'].includes(value as string)) {
          setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Must be: direct, fluid, or narrative' }));
          setIsLoading(false);
          return;
        }
      }
      
      if (field.apiField === 'language_code') {
        if (!['pt', 'en', 'es', 'fr'].includes(value as string)) {
          setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Must be: pt, en, es, or fr' }));
          setIsLoading(false);
          return;
        }
      }
      
      // Validar limites de caracteres
      if (field.apiField === 'mission_short' && (value as string).length > 500) {
        setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Maximum 500 characters' }));
        setIsLoading(false);
        return;
      }
      
      if (field.apiField === 'writing_notes' && (value as string).length > 2000) {
        setValidationErrors(prev => ({ ...prev, [fieldKey]: 'Maximum 2000 characters' }));
        setIsLoading(false);
        return;
      }
      
      await updateBusinessField(field.apiField, value);
      
      // Update original value after successful save
      const updatedValue = Array.isArray(value) ? value.join(', ') : value;
      setOriginalValues(prev => ({
        ...prev,
        [field.apiField]: updatedValue
      }));
      
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
                <p className="text-white text-sm">{validationError}</p>
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

  const renderSelectField = (
    fieldKey: keyof typeof fields,
    label: string,
    options: { label: string; value: string }[]
  ) => {
    const field = fields[fieldKey];
    if (!field) return null;

    return (
      <div className="flex items-start justify-between py-2">
        <div className="flex-1">
          <div className="text-sm text-gray-400">{label}</div>
          {field.isEditing ? (
            <select
              value={field.value}
              onChange={(e) => updateField(fieldKey, e.target.value)}
              className="w-full bg-black text-white border border-white rounded px-2 py-1 mt-1 focus:outline-none focus:ring-2 focus:ring-white"
              autoFocus
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-black">
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-white mt-1">
              {options.find((opt) => opt.value === field.value)?.label || field.value}
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

  // Component for array fields (keywords)
  const ArrayFieldEditor: React.FC<{
    fieldKey: keyof typeof fields;
    label: string;
  }> = ({ fieldKey, label }) => {
    const field = fields[fieldKey];
    const [inputValue, setInputValue] = React.useState('');
    
    if (!field) return null;

    const arrayValue = field.value ? field.value.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

    const addItem = () => {
      if (inputValue.trim()) {
        const newArray = [...arrayValue, inputValue.trim()];
        updateField(fieldKey, newArray.join(', '));
        setInputValue('');
      }
    };

    const removeItem = (index: number) => {
      const newArray = arrayValue.filter((_: string, i: number) => i !== index);
      updateField(fieldKey, newArray.join(', '));
    };

    return (
      <div className="flex items-start justify-between py-2">
        <div className="flex-1">
          <div className="text-sm text-gray-400">{label}</div>
          {field.isEditing ? (
            <div className="space-y-2 mt-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addItem()}
                  placeholder="Add keyword..."
                  className="flex-1 bg-black text-white border border-white rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-white"
                />
                <button
                  onClick={addItem}
                  className="px-3 py-1 bg-white text-black rounded hover:bg-gray-200 font-medium"
                >
                  Add
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {arrayValue.map((item: string, index: number) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-gray-700 rounded text-sm"
                  >
                    {item}
                    <button
                      onClick={() => removeItem(index)}
                      className="text-gray-400 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {arrayValue.length > 0 ? (
                arrayValue.map((item: string, index: number) => (
                  <span key={index} className="px-2 py-1 bg-gray-700 rounded text-sm">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-gray-500">None</span>
              )}
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
          <div className="bg-white/10 border border-white rounded-lg p-4">
            <p className="text-white">{error}</p>
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
                      {renderField('mainObjective')}
                      {renderField('missionShort', true)}
                      {renderField('writingNotes', true)}
                      
                      {/* Tone Settings */}
                      <div className="pt-4">
                        <h3 className="text-sm font-medium text-gray-400 mb-3">Tone & Style</h3>
                        {renderSelectField('tone_formality', 'Formality', [
                          { label: 'Formal', value: 'formal' },
                          { label: 'Neutral', value: 'neutral' },
                          { label: 'Informal', value: 'informal' },
                        ])}
                        {renderSelectField('tone_emotion', 'Emotion', [
                          { label: 'Rational', value: 'rational' },
                          { label: 'Balanced', value: 'balanced' },
                          { label: 'Emotional', value: 'emotional' },
                        ])}
                        {renderSelectField('tone_rhythm', 'Rhythm', [
                          { label: 'Direct', value: 'direct' },
                          { label: 'Fluid', value: 'fluid' },
                          { label: 'Narrative', value: 'narrative' },
                        ])}
                        {renderSelectField('language_code', 'Language', [
                          { label: 'Português', value: 'pt' },
                          { label: 'English', value: 'en' },
                          { label: 'Español', value: 'es' },
                          { label: 'Français', value: 'fr' },
                        ])}
                      </div>
                      
                      {/* Keywords */}
                      <ArrayFieldEditor fieldKey="keywords_must" label="Keywords (Must Include)" />
                      <ArrayFieldEditor fieldKey="keywords_avoid" label="Keywords (Avoid)" />
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
                        className="w-full flex items-center py-2 text-white hover:text-gray-400 transition-colors"
                      >
                        <LogOut className="w-5 h-5 mr-2" />
                        <span>Log out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Niches Section (Read-only display) */}
            {userSettings && userSettings.niches && userSettings.niches.length > 0 && (
              <div className="border-t border-white/10 py-4">
                <h3 className="text-lg font-semibold mb-3">Your Niches</h3>
                <div className="flex flex-wrap gap-2">
                  {userSettings.niches.map((niche, index) => (
                    <span key={index} className="px-3 py-1 bg-gray-800 rounded-full text-sm text-gray-300">
                      {niche}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Influencers Section (Read-only display) */}
            {userSettings && userSettings.influencers && userSettings.influencers.length > 0 && (
              <div className="border-t border-white/10 py-4 mb-8">
                <h3 className="text-lg font-semibold mb-3">Following Influencers</h3>
                <div className="space-y-2">
                  {userSettings.influencers.map((influencer, index) => (
                    <div key={index} className="flex items-center justify-between text-gray-300">
                      <div className="flex items-center">
                        <span className="w-2 h-2 bg-white rounded-full mr-3"></span>
                        <div>
                          <div className="font-medium">{influencer.display_name}</div>
                          <div className="text-sm text-gray-500">@{influencer.instagram_username}</div>
                        </div>
                      </div>
                      <span className="text-xs text-gray-500">Added {new Date(influencer.added_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
