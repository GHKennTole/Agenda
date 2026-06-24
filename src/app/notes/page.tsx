'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import styles from './notes.module.css';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function NotesPage() {
  const supabase = createClient();

  // Estados
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  // Cargar notas al montar
  useEffect(() => {
    fetchNotes();

    // Escuchar actualizaciones del asistente de voz
    const handleAgendaUpdate = () => {
      fetchNotes();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('agenda-updated', handleAgendaUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('agenda-updated', handleAgendaUpdate);
      }
    };
  }, []);

  // Fetch de notas desde Supabase
  const fetchNotes = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setNotes(data);
    } catch (err) {
      console.error('Error cargando notas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Crear nota manualmente
  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoteTitle.trim() || !newNoteContent.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('notes')
        .insert([
          {
            user_id: user.id,
            title: newNoteTitle.trim(),
            content: newNoteContent.trim()
          }
        ])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setNotes([data, ...notes]);
        setNewNoteTitle('');
        setNewNoteContent('');
        setShowForm(false);
      }
    } catch (err) {
      console.error('Error creando nota:', err);
    }
  };

  // Eliminar nota
  const handleDeleteNote = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Evitar que se abra el modal al hacer clic en borrar
    if (!confirm('¿Deseas eliminar esta nota permanentemente?')) return;

    // Actualización optimista local
    setNotes(notes.filter((note) => note.id !== id));

    try {
      const { error } = await supabase
        .from('notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error eliminando nota:', err);
      fetchNotes();
    }
  };

  // Helper para formatear fechas de notas
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={styles.container}>
      {/* Botón para alternar formulario de nueva nota */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Mis Notas</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn"
          style={{ padding: '8px 16px', borderRadius: '10px' }}
        >
          {showForm ? 'Cancelar' : 'Nueva Nota'}
        </button>
      </div>

      {/* Formulario Manual de Nueva Nota */}
      {showForm && (
        <form onSubmit={handleCreateNote} className={styles.noteForm}>
          <input
            type="text"
            className="input"
            placeholder="Título de la nota..."
            value={newNoteTitle}
            onChange={(e) => setNewNoteTitle(e.target.value)}
            required
          />
          <textarea
            className="input"
            style={{ minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' }}
            placeholder="Escribe el contenido de tu nota aquí..."
            value={newNoteContent}
            onChange={(e) => setNewNoteContent(e.target.value)}
            required
          />
          <div className={styles.formActions}>
            <button type="submit" className="btn">Guardar Nota</button>
          </div>
        </form>
      )}

      {/* Grid de Notas */}
      {loading && notes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Cargando tus notas...
        </div>
      ) : notes.length > 0 ? (
        <div className={styles.grid}>
          {notes.map((note) => (
            <div
              key={note.id}
              className={styles.noteCard}
              onClick={() => setActiveNote(note)}
            >
              <div className={styles.noteCardHeader}>
                <h3 className={styles.noteTitle}>{note.title}</h3>
                {/* Botón Eliminar */}
                <button
                  onClick={(e) => handleDeleteNote(e, note.id)}
                  className={styles.deleteBtn}
                  aria-label="Eliminar nota"
                >
                  <svg className={styles.deleteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
              <span className={styles.noteDate}>{formatDate(note.created_at)}</span>
              <p className={styles.noteExcerpt}>{note.content}</p>
            </div>
          ))}
        </div>
      ) : (
        /* Estado vacío */
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <p style={{ fontSize: '15px', fontWeight: 600 }}>No hay notas guardadas</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Dicta una nota al asistente de voz o presiona "Nueva Nota" arriba para crear una manual.
          </p>
        </div>
      )}

      {/* Modal de Lectura Expandida de Nota */}
      {activeNote && (
        <div className={styles.modalOverlay} onClick={() => setActiveNote(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{activeNote.title}</h3>
              <button onClick={() => setActiveNote(null)} className={styles.modalClose} aria-label="Cerrar">
                <svg className={styles.modalCloseIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className={styles.modalBody}>
              <p className={styles.modalContent}>{activeNote.content}</p>
            </div>

            <div className={styles.modalFooter}>
              Creada el {formatDate(activeNote.created_at)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
