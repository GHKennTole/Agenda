'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import styles from './login.module.css';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // Estados
  const [isPasswordMode, setIsPasswordMode] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Intentar login por Passkey automáticamente al cargar si no está en modo contraseña
  useEffect(() => {
    // Solo intentamos si no estamos en modo contraseña
    if (!isPasswordMode) {
      // Pequeño retraso para dejar que la página cargue visualmente
      const timer = setTimeout(() => {
        handlePasskeyLogin();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isPasswordMode]);

  // Manejar Login con Passkey (Huella Digital)
  const handlePasskeyLogin = async () => {
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      // Iniciar el flujo de WebAuthn de Supabase
      const { data, error: authError } = await supabase.auth.signInWithPasskey();

      if (authError) {
        // Ignorar el error común de cancelación por parte del usuario
        if (authError.message.includes('cancelled') || authError.message.includes('abort')) {
          setLoading(false);
          return;
        }
        throw authError;
      }

      if (data?.session) {
        setMessage('Identidad verificada. Redirigiendo...');
        router.replace('/');
        router.refresh();
      }
    } catch (err: any) {
      console.error('Error de Passkey:', err);
      setError(
        err.message || 
        'No se pudo autenticar con huella digital. Asegúrate de haberla registrado previamente o inicia con tu contraseña de respaldo.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Manejar Login o Registro con Contraseña (Backup)
  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isSignUp) {
        // Registrar nuevo usuario
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          }
        });

        if (signUpError) throw signUpError;

        if (data?.user?.identities?.length === 0) {
          setError('Este correo ya está registrado. Intenta iniciar sesión.');
        } else {
          setMessage('¡Registro exitoso! Por favor, verifica tu correo para confirmar tu cuenta y luego inicia sesión.');
          setIsSignUp(false);
        }
      } else {
        // Iniciar sesión
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (data?.session) {
          setMessage('Sesión iniciada. Redirigiendo...');
          router.replace('/');
          router.refresh();
        }
      }
    } catch (err: any) {
      console.error('Error de contraseña:', err);
      setError(err.message || 'Ocurrió un error al autenticar. Verifica tus credenciales.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <h1 className={styles.title}>Mi Agenda</h1>
          <p className={styles.subtitle}>
            {isPasswordMode 
              ? (isSignUp ? 'Crea una cuenta para tu agenda personal' : 'Acceso de respaldo mediante contraseña')
              : 'Tu agenda personal privada y segura'}
          </p>
        </div>

        {/* Alertas de error y éxito */}
        {error && <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>}
        {message && <div className={`${styles.alert} ${styles.alertSuccess}`}>{message}</div>}

        {!isPasswordMode ? (
          /* MODO BIOMÉTRICO (PASSKEY) */
          <div className={styles.biometricSection}>
            <div className={styles.fingerprintWrapper}>
              <div className={styles.pulse}></div>
              <div className={styles.pulse2}></div>
              <button 
                onClick={handlePasskeyLogin} 
                className={styles.fingerprintBtn}
                disabled={loading}
                aria-label="Escanear huella digital"
              >
                {/* SVG elegante de una huella digital */}
                <svg className={styles.fingerprintIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" opacity="0.2" />
                  <path d="M12 2a10 10 0 0 0 -10 10" />
                  <path d="M12 6a6 6 0 0 0 -6 6" />
                  <path d="M12 10a2 2 0 0 0 -2 2" />
                  <path d="M12 14v4" />
                  <path d="M12 18h.01" />
                  <path d="M8.5 14.5c.6 -1.2 1.9 -2 3.5 -2s2.9 .8 3.5 2" />
                  <path d="M5.5 16.5c1.2 -2.5 3.8 -4 6.5 -4s5.3 1.5 6.5 4" />
                  <path d="M15.5 9.5a5 5 0 0 0 -7 0" />
                  <path d="M18.5 12.5a8 8 0 0 0 -13 0" />
                </svg>
              </button>
            </div>
            <button 
              onClick={handlePasskeyLogin} 
              className={styles.actionText}
              disabled={loading}
            >
              {loading ? 'Verificando huella...' : 'Toca para escanear huella'}
            </button>

            <div className={styles.divider}>
              <span className={styles.dividerSpan}>o</span>
            </div>

            <button 
              onClick={() => setIsPasswordMode(true)} 
              className={styles.submitBtn}
              style={{ marginTop: 0 }}
            >
              Iniciar con Contraseña
            </button>
          </div>
        ) : (
          /* MODO CONTRASEÑA (BACKUP / PRIMER INGRESO) */
          <form onSubmit={handlePasswordAuth} className={styles.form}>
            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="email">Correo Electrónico</label>
              <input
                id="email"
                type="email"
                className={styles.input}
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label} htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                className={styles.input}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading 
                ? 'Procesando...' 
                : (isSignUp ? 'Crear Cuenta Personal' : 'Iniciar Sesión')}
            </button>

            <div className={styles.formToggle}>
              {isSignUp ? '¿Ya tienes cuenta?' : '¿Es tu primera vez aquí?'}
              <button
                type="button"
                className={styles.formToggleLink}
                onClick={() => setIsSignUp(!isSignUp)}
                disabled={loading}
              >
                {isSignUp ? 'Inicia sesión' : 'Regístrate'}
              </button>
            </div>

            <div className={styles.divider}>
              <span className={styles.dividerSpan}>o</span>
            </div>

            <button 
              type="button"
              onClick={() => setIsPasswordMode(false)} 
              className={styles.submitBtn}
              style={{ background: 'transparent', borderColor: 'rgba(255, 255, 255, 0.1)' }}
            >
              Volver al Desbloqueo por Huella
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
