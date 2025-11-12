import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowLeft, Check, AlertCircle } from 'lucide-react';
import { createBusiness } from '../services/business';
import type { CreateBusinessRequest, FormQuestion, BusinessValidationError } from '../types/business';

const FORM_QUESTIONS: FormQuestion[] = [
  {
    key: 'mission_short',
    question: 'Em 1 frase: que resultado concreto você entrega e pra quem?',
    type: 'text',
    options: [],
  },
  {
    key: 'tone_formality',
    question: 'Qual o nível de formalidade da sua comunicação?',
    type: 'select',
    options: [
      { label: 'Formal', value: 'formal' },
      { label: 'Neutra', value: 'neutral' },
      { label: 'Informal', value: 'informal' },
    ],
  },
  {
    key: 'tone_emotion',
    question: 'A copy deve soar mais racional, equilibrada ou emocional?',
    type: 'select',
    options: [
      { label: 'Racional', value: 'rational' },
      { label: 'Equilibrada', value: 'balanced' },
      { label: 'Emocional', value: 'emotional' },
    ],
  },
  {
    key: 'tone_rhythm',
    question: 'Qual ritmo prefere nas mensagens?',
    type: 'select',
    options: [
      { label: 'Direto (frases curtas e objetivas)', value: 'direct' },
      { label: 'Fluido (transições suaves, 1–2 frases por slide)', value: 'fluid' },
      { label: 'Narrativo (abre com gancho e mini-história)', value: 'narrative' },
    ],
  },
  {
    key: 'keywords_must',
    question: 'Quais termos DEVEM aparecer? (marca, features, claims permitidas)',
    type: 'array_text',
    options: [],
  },
  {
    key: 'keywords_avoid',
    question: 'Quais termos NÃO podem aparecer? (jargões proibidos, promessas sensíveis)',
    type: 'array_text',
    options: [],
  },
  {
    key: 'language_code',
    question: 'Idioma principal do conteúdo?',
    type: 'select',
    options: [
      { label: 'Português', value: 'pt' },
      { label: 'Inglês', value: 'en' },
      { label: 'Espanhol', value: 'es' },
      { label: 'Francês', value: 'fr' },
    ],
  },
  {
    key: 'writing_notes',
    question: 'Regras finas de escrita? (ex.: sem emoji, evitar CAPS, usar 2ª pessoa)',
    type: 'text',
    options: [],
  },
];

const CreateBusinessPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<CreateBusinessRequest>({
    tone_formality: 'neutral',
    tone_emotion: 'balanced',
    tone_rhythm: 'direct',
    keywords_must: [],
    keywords_avoid: [],
    language_code: 'pt',
  });
  const [arrayInput, setArrayInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<BusinessValidationError[]>([]);
  const [successMessage, setSuccessMessage] = useState('');

  const currentQuestion = FORM_QUESTIONS[currentStep];
  const isLastStep = currentStep === FORM_QUESTIONS.length - 1;

  const handleTextChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      [currentQuestion.key]: value,
    }));
    setErrors([]);
  };

  const handleSelectChange = (value: string) => {
    setFormData(prev => ({
      ...prev,
      [currentQuestion.key]: value,
    }));
    setErrors([]);
  };

  const handleArrayAdd = () => {
    if (!arrayInput.trim()) return;

    const key = currentQuestion.key as 'keywords_must' | 'keywords_avoid';
    const currentArray = (formData[key] || []) as string[];

    setFormData(prev => ({
      ...prev,
      [key]: [...currentArray, arrayInput.trim()],
    }));
    setArrayInput('');
    setErrors([]);
  };

  const handleArrayRemove = (index: number) => {
    const key = currentQuestion.key as 'keywords_must' | 'keywords_avoid';
    const currentArray = (formData[key] || []) as string[];

    setFormData(prev => ({
      ...prev,
      [key]: currentArray.filter((_, i) => i !== index),
    }));
  };

  const handleNext = () => {
    if (currentStep < FORM_QUESTIONS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setErrors([]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrors([]);
    setSuccessMessage('');

    try {
      console.log('📤 Enviando dados do business:', formData);
      const response = await createBusiness(formData);
      console.log('✅ Business criado com sucesso:', response);

      setSuccessMessage('Business criado com sucesso!');

      // Atualiza o localStorage para indicar que o setup foi concluído
      const user = localStorage.getItem('user');
      if (user) {
        const userData = JSON.parse(user);
        userData.needs_business_setup = false;
        localStorage.setItem('user', JSON.stringify(userData));
      }

      // Redireciona para a página principal após 2 segundos
      setTimeout(() => {
        navigate('/feed');
      }, 2000);
    } catch (error: any) {
      console.error('❌ Erro ao criar business:', error);

      if (error.errors && Array.isArray(error.errors)) {
        setErrors(error.errors);
      } else {
        setErrors([
          {
            field: 'general',
            message: error.message || 'Erro ao criar business. Tente novamente.',
          },
        ]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderQuestionInput = () => {
    const fieldError = errors.find(e => e.field === currentQuestion.key);

    switch (currentQuestion.type) {
      case 'text':
        return (
          <div>
            <textarea
              value={(formData[currentQuestion.key] as string) || ''}
              onChange={(e) => handleTextChange(e.target.value)}
              className={`w-full px-4 py-3 bg-neutral-900 border ${
                fieldError ? 'border-white' : 'border-neutral-800'
              } rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors resize-none`}
              rows={4}
              placeholder="Digite sua resposta..."
              maxLength={currentQuestion.key === 'mission_short' ? 500 : 2000}
            />
            {fieldError && (
              <p className="mt-2 text-sm text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {fieldError.message}
              </p>
            )}
            <p className="mt-2 text-sm text-neutral-500">
              {((formData[currentQuestion.key] as string) || '').length}/
              {currentQuestion.key === 'mission_short' ? 500 : 2000} caracteres
            </p>
          </div>
        );

      case 'select':
        return (
          <div>
            <div className="space-y-3">
              {currentQuestion.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSelectChange(option.value)}
                  className={`w-full px-6 py-4 rounded-lg border-2 transition-all text-left ${
                    formData[currentQuestion.key] === option.value
                      ? 'border-white bg-white/10 text-white'
                      : 'border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{option.label}</span>
                    {formData[currentQuestion.key] === option.value && (
                      <Check className="w-5 h-5 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
            {fieldError && (
              <p className="mt-3 text-sm text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {fieldError.message}
              </p>
            )}
          </div>
        );

      case 'array_text':
        const key = currentQuestion.key as 'keywords_must' | 'keywords_avoid';
        const currentArray = (formData[key] || []) as string[];

        return (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={arrayInput}
                onChange={(e) => setArrayInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleArrayAdd();
                  }
                }}
                className={`flex-1 px-4 py-3 bg-neutral-900 border ${
                  fieldError ? 'border-white' : 'border-neutral-800'
                } rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-white transition-colors`}
                placeholder="Digite um termo e pressione Enter..."
              />
              <button
                onClick={handleArrayAdd}
                disabled={!arrayInput.trim()}
                className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Adicionar
              </button>
            </div>

            {fieldError && (
              <p className="mb-3 text-sm text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {fieldError.message}
              </p>
            )}

            {currentArray.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {currentArray.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-800 rounded-full text-sm text-neutral-300"
                  >
                    <span>{item}</span>
                    <button
                      onClick={() => handleArrayRemove(index)}
                      className="text-neutral-500 hover:text-white transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {currentArray.length === 0 && (
              <p className="text-sm text-neutral-500 italic">
                Nenhum termo adicionado ainda
              </p>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-full mb-4">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Configure seu Business
          </h1>
          <p className="text-neutral-400">
            Responda algumas perguntas para personalizar a geração de conteúdo
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-neutral-400">
              Pergunta {currentStep + 1} de {FORM_QUESTIONS.length}
            </span>
            <span className="text-sm text-neutral-400">
              {Math.round(((currentStep + 1) / FORM_QUESTIONS.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-white h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((currentStep + 1) / FORM_QUESTIONS.length) * 100}%`,
              }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-8 mb-6">
          <h2 className="text-xl font-semibold text-white mb-6">
            {currentQuestion.question}
          </h2>

          {renderQuestionInput()}
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="mb-6 p-4 bg-white/10 border border-white rounded-lg">
            <p className="text-white flex items-center gap-2">
              <Check className="w-5 h-5" />
              {successMessage}
            </p>
          </div>
        )}

        {/* General Errors */}
        {errors.some(e => e.field === 'general') && (
          <div className="mb-6 p-4 bg-white/10 border border-white rounded-lg">
            <p className="text-white flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              {errors.find(e => e.field === 'general')?.message}
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            Anterior
          </button>

          {!isLastStep ? (
            <button
              onClick={handleNext}
              className="flex-1 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Próxima
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Concluir
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateBusinessPage;
