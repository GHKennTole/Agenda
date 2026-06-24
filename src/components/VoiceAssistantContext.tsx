'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './VoiceAssistant.module.css';

// Declarar tipos para Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface VoiceAssistantContextType {
  isListening: boolean;
  isProcessing: boolean;
  error: string | null;
  toggleListening: () => void;
  cancelListening: () => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextType | undefined>(undefined);

export function useVoiceAssistant() {
  const context = useContext(VoiceAssistantContext);
  if (!context) {
    throw new Error('useVoiceAssistant debe usarse dentro de un VoiceAssistantProvider');
  }
  return context;
}

export function VoiceAssistantProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  // Estados
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Referencia al objeto de reconocimiento de voz
  const recognitionRef = useRef<any>(null);
  const isSelfStopped = useRef(false);

  useEffect(() => {
    // Inicializar Web Speech API
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'es-ES'; // Configurar en español

      rec.onstart = () => {
        setIsListening(true);
        setTranscript('');
        setError(null);
        isSelfStopped.current = false;
      };

      rec.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        setTranscript(finalTranscript || interimTranscript);
      };

      rec.onerror = (event: any) => {
        console.error('Error en reconocimiento de voz:', event.error);
        if (event.error === 'not-allowed') {
          setError('Permiso de micrófono denegado. Habilita el acceso al micrófono en tu navegador.');
        } else if (event.error !== 'no-speech') {
          setError('Ocurrió un error al capturar tu voz: ' + event.error);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        // Si no se detuvo manualmente por cancelación, procesamos el resultado
        if (!isSelfStopped.current) {
          // Usamos el transcript actual
          setTranscript((prev) => {
            if (prev && prev.trim().length > 0) {
              processVoiceText(prev.trim());
            }
            return prev;
          });
        }
      };

      recognitionRef.current = rec;
    }
  }, []);

  // Iniciar/Detener grabación de voz
  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError('El dictado por voz no es compatible con este navegador.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        setError(null);
        recognitionRef.current.start();
      } catch (e) {
        console.error('Error al iniciar micrófono:', e);
      }
    }
  };

  // Cancelar la grabación (sin procesar)
  const cancelListening = () => {
    if (recognitionRef.current && isListening) {
      isSelfStopped.current = true;
      recognitionRef.current.abort();
      setIsListening(false);
      setTranscript('');
    }
  };

  // Enviar el texto transcrito al backend para procesarlo con la IA de Gemini
  const processVoiceText = async (text: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      const response = await fetch('/api/process-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Error al procesar la nota de voz.');
      }

      const result = await response.json();
      
      // Mostrar feedback o refrescar
      router.refresh();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agenda-updated'));
      }
    } catch (err: any) {
      console.error('Error procesando voz con IA:', err);
      setError(err.message || 'No se pudo procesar la nota con la IA de Gemini.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <VoiceAssistantContext.Provider value={{ isListening, isProcessing, error, toggleListening, cancelListening }}>
      {children}

      {/* Pantalla de superposición activa cuando se escucha o procesa */}
      {(isListening || isProcessing) && (
        <div className={styles.overlay}>
          <div className={styles.container}>
            <h2 className={`${styles.status} ${isProcessing ? styles.statusProcessing : ''}`}>
              {isProcessing ? 'Procesando con Gemini AI...' : 'Escuchando tu voz...'}
            </h2>

            {isListening && (
              <div className={styles.waveContainer}>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
                <div className={styles.waveBar}></div>
              </div>
            )}

            <div className={styles.transcriptContainer}>
              {transcript ? (
                <p className={styles.transcriptText}>"{transcript}"</p>
              ) : (
                <p className={styles.placeholderText}>Di algo como "comprar café mañana a las 3 pm"...</p>
              )}
            </div>

            {error && (
              <div style={{ color: 'var(--color-danger)', marginBottom: '20px', fontSize: '14px' }}>
                {error}
              </div>
            )}

            <button onClick={cancelListening} className={styles.closeBtn} aria-label="Cancelar">
              {/* Icono de cerrar (X) */}
              <svg className={styles.closeBtnIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      )}
    </VoiceAssistantContext.Provider>
  );
}
