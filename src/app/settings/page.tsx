'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import styles from './settings.module.css';

interface Passkey {
  id: string;
  friendlyName: string;
  createdAt?: string;
}

export default function SettingsPage() {
  const supabase = createClient();

  // Estados
  const [userEmail, setUserEmail] = useState<string>('');
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [newKeyName, setNewKeyName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Cargar datos al montar
  useEffect(() => {
    loadUserData();
    loadPasskeys();
  }, []);

  const loadUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setUserEmail(user.email);
    }
  };

  const loadPasskeys = async () => {
    try {
      // Intentar listar passkeys registradas
      const { data, error: listError } = await supabase.auth.passkey.list();
      
      if (listError) {
        // Si la API de passkeys no está lista en la cuenta o devuelve error,
        // capturamos para evitar romper la UI.
        console.warn('Error al listar passkeys (experimental):', listError);
        return;
      }

      if (data) {
        // En algunas versiones experimentales, data es un array directo de credenciales
        const formattedKeys = data.map((key: any) => ({
          id: key.id,
          friendlyName: key.friendly_name || key.friendlyName || 'Dispositivo biométrico',
          createdAt: key.created_at || new Date().toISOString()
        }));
        setPasskeys(formattedKeys);
      }
    } catch (err) {
      console.error('Error cargando passkeys:', err);
    }
  };

  // Registrar nueva huella digital (Passkey)
  const handleRegisterPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim() || 'Mi Celular';
    
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      // 1. Iniciar registro de Passkey
      const { data, error: registerError } = await supabase.auth.registerPasskey();

      if (registerError) {
        // Ignorar cancelaciones del usuario
        if (registerError.message.includes('cancelled') || registerError.message.includes('abort')) {
          setLoading(false);
          return;
        }
        throw registerError;
      }

      // 2. Si se registra con éxito, podemos renombrarla con el nombre descriptivo
      if (data?.id) {
        try {
          await supabase.auth.passkey.update({
            passkeyId: data.id,
            friendlyName: name
          });
        } catch (updateErr) {
          console.warn('No se pudo guardar el nombre descriptivo de la huella:', updateErr);
        }
        
        setSuccess(`¡Huella digital "${name}" registrada exitosamente! Ahora puedes usarla para ingresar.`);
        setNewKeyName('');
        loadPasskeys();
      }
    } catch (err: any) {
      console.error('Error registrando passkey:', err);
      setError(
        err.message || 
        'Hubo un problema al registrar tu huella digital. Asegúrate de tener habilitado el bloqueo por huella en tu dispositivo y haber activado Passkeys en el panel de Supabase.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Eliminar una huella digital
  const handleDeletePasskey = async (id: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar la huella "${name}"?`)) {
      return;
    }

    setError(null);
    setSuccess(null);

    try {
      const { error: deleteError } = await supabase.auth.passkey.delete({ passkeyId: id });
      
      if (deleteError) throw deleteError;

      setSuccess(`Huella digital "${name}" eliminada correctamente.`);
      loadPasskeys();
    } catch (err: any) {
      console.error('Error al eliminar passkey:', err);
      setError(err.message || 'No se pudo eliminar la huella digital.');
    }
  };

  return (
    <div className={styles.container}>
      {/* Sección Perfil */}
      <div className="card">
        <div className={styles.profileSection}>
          <div className={styles.avatar}>
            {userEmail ? userEmail[0].toUpperCase() : 'U'}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.email}>{userEmail || 'Cargando usuario...'}</span>
            <span className={styles.role}>Propietario de la Agenda</span>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {error && <div className="card" style={{ background: 'rgba(255, 74, 74, 0.1)', borderColor: 'rgba(255, 74, 74, 0.2)', color: '#ff8080', fontSize: '13px' }}>{error}</div>}
      {success && <div className="card" style={{ background: 'rgba(46, 213, 115, 0.1)', borderColor: 'rgba(46, 213, 115, 0.2)', color: '#7bed9f', fontSize: '13px' }}>{success}</div>}

      {/* Seguridad Biométrica */}
      <div className="card">
        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Seguridad Biométrica</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
          Configura el desbloqueo por huella digital (Passkey) para acceder a tu agenda de forma instantánea y segura sin escribir contraseñas.
        </p>

        <form onSubmit={handleRegisterPasskey} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            type="text"
            className="input"
            placeholder="Nombre de la huella (ej: Mi Android)"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            disabled={loading}
            required
          />
          <button type="submit" className="btn" disabled={loading}>
            <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
            {loading ? 'Registrando...' : 'Registrar mi Huella Digital'}
          </button>
        </form>

        <div className={styles.infoBox}>
          <strong>Nota de Configuración:</strong> Para que el registro funcione, debes tener activado el bloqueo de pantalla por huella en tu celular y haber activado la opción de **Passkeys** en tu panel de Supabase en <em>Authentication → Passkeys</em>.
        </div>
      </div>

      {/* Lista de Huellas Registradas */}
      <div className="card">
        <h2 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>Tus Huellas Registradas</h2>
        
        {passkeys.length > 0 ? (
          <div className={styles.passkeyList}>
            {passkeys.map((key) => (
              <div key={key.id} className={styles.passkeyItem}>
                <div className={styles.passkeyInfo}>
                  <svg className={styles.passkeyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 11c0-.797.15-1.558.422-2.257m-.004-.002A9 9 0 1 1 5.316 16.5m1.349-1.349a6 6 0 1 1 8.486-8.486"></path>
                    <path d="M12 14v4"></path>
                    <path d="M12 18h.01"></path>
                  </svg>
                  <div>
                    <div className={styles.passkeyName}>{key.friendlyName}</div>
                    <div className={styles.passkeyDate}>
                      Registrada el {key.createdAt ? new Date(key.createdAt).toLocaleDateString('es-ES') : 'recientemente'}
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => handleDeletePasskey(key.id, key.friendlyName)}
                  className={styles.deleteBtn}
                  title="Eliminar huella"
                >
                  <svg className={styles.deleteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            Aún no has registrado ninguna huella digital.
          </div>
        )}
      </div>
    </div>
  );
}
