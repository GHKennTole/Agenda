'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import BottomNav from './BottomNav';
import { VoiceAssistantProvider } from './VoiceAssistantContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isLoginPage = pathname === '/login';

  // Registrar Service Worker para soporte PWA (Solo en producción para evitar bucles de reinicio con HMR)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('Service Worker registrado con éxito. Ámbito:', reg.scope);
        })
        .catch((err) => {
          console.error('Error al registrar el Service Worker:', err);
        });
    }
  }, []);

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.replace('/login');
      router.refresh();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
    }
  };

  // Si estamos en la página de login, no renderizar la barra de navegación ni el header
  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <VoiceAssistantProvider>
      <div className="app-container">
        {/* Encabezado Principal */}
        <header className="app-header">
          <h1 className="app-title">Mi Agenda</h1>
          
          {/* Botón de Cerrar Sesión (Salida Segura) */}
          <button 
            onClick={handleSignOut}
            className="btn btn-secondary"
            style={{ 
              padding: '6px 12px', 
              fontSize: '12px', 
              borderRadius: '8px', 
              background: 'transparent',
              borderColor: 'rgba(255, 255, 255, 0.1)'
            }}
            aria-label="Cerrar sesión"
          >
            {/* Icono de cerrar sesión */}
            <svg style={{ width: '14px', height: '14px', color: 'var(--text-secondary)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </header>

        {/* Contenido Principal */}
        <main className="main-content">
          {children}
        </main>

        {/* Navegación Inferior */}
        <BottomNav />
      </div>
    </VoiceAssistantProvider>
  );
}
