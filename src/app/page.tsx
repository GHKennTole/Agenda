'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import styles from './dashboard.module.css';

interface Todo {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  due_time: string | null;
  completed: boolean;
  category: string;
  created_at: string;
}

// Función para exportar tareas a formato iCalendar (.ics) local
const exportToIcs = (todo: Todo) => {
  if (!todo.due_date) return;
  
  const title = todo.title;
  const description = todo.description || 'Recordatorio de mi agenda personal';
  
  let dateStart = '';
  let dateEnd = '';
  
  const cleanDate = todo.due_date.replace(/-/g, '');
  if (todo.due_time) {
    const cleanTime = todo.due_time.replace(/:/g, '') + '00';
    dateStart = `${cleanDate}T${cleanTime}`;
    
    const [hours, minutes] = todo.due_time.split(':');
    const endHours = String((Number(hours) + 1) % 24).padStart(2, '0');
    const cleanEndTime = `${endHours}${minutes}00`;
    dateEnd = `${cleanDate}T${cleanEndTime}`;
  } else {
    dateStart = cleanDate;
    const nextDay = new Date(todo.due_date + 'T00:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const cleanNextDay = nextDay.toISOString().split('T')[0].replace(/-/g, '');
    dateEnd = cleanNextDay;
  }
  
  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mi Agenda Personal//ES',
    'BEGIN:VEVENT',
    `UID:${todo.id}@miagenda.local`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    todo.due_time ? `DTSTART:${dateStart}` : `DTSTART;VALUE=DATE:${dateStart}`,
    todo.due_time ? `DTEND:${dateEnd}` : `DTEND;VALUE=DATE:${dateEnd}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function DashboardPage() {
  const supabase = createClient();

  // Estados
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'week' | 'completed'>('all');
  const [loading, setLoading] = useState(true);

  // Cargar tareas al montar
  useEffect(() => {
    fetchTodos();

    // Escuchar el evento personalizado de actualización cuando el asistente de voz procese algo
    const handleAgendaUpdate = () => {
      fetchTodos();
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

  // Fetch de tareas desde Supabase
  const fetchTodos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('completed', { ascending: true })
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setTodos(data);
    } catch (err) {
      console.error('Error cargando tareas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Agregar tarea manualmente
  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('todos')
        .insert([
          {
            user_id: user.id,
            title: newTodoTitle.trim(),
            category: 'general',
            completed: false
          }
        ])
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setTodos([data, ...todos]);
        setNewTodoTitle('');
      }
    } catch (err) {
      console.error('Error al agregar tarea:', err);
    }
  };

  // Alternar estado de completado
  const handleToggleComplete = async (id: string, currentCompleted: boolean) => {
    // Actualizar estado local primero para una respuesta instantánea (optimistic update)
    setTodos(
      todos.map((todo) =>
        todo.id === id ? { ...todo, completed: !currentCompleted } : todo
      )
    );

    try {
      const { error } = await supabase
        .from('todos')
        .update({ completed: !currentCompleted })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error al actualizar tarea:', err);
      // Revertir en caso de error
      fetchTodos();
    }
  };

  // Eliminar tarea
  const handleDeleteTodo = async (id: string) => {
    if (!confirm('¿Deseas eliminar esta tarea?')) return;

    // Actualizar UI localmente
    setTodos(todos.filter((todo) => todo.id !== id));

    try {
      const { error } = await supabase
        .from('todos')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Error al eliminar tarea:', err);
      fetchTodos();
    }
  };

  // Filtrar tareas según la pestaña activa
  const getFilteredTodos = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    
    return todos.filter((todo) => {
      if (activeFilter === 'completed') {
        return todo.completed;
      }
      
      // Si la tarea está completada y el filtro no es "completadas", la filtramos si queremos, 
      // o la dejamos. Generalmente las tareas completadas van al final, pero si filtramos "Hoy" o "Semana",
      // preferimos ver solo las pendientes.
      if (todo.completed) return false;

      if (activeFilter === 'today') {
        return todo.due_date === todayStr;
      }
      
      if (activeFilter === 'week') {
        if (!todo.due_date) return false;
        const dueDate = new Date(todo.due_date);
        const today = new Date();
        const endOfWeek = new Date();
        endOfWeek.setDate(today.getDate() + 7);
        return dueDate >= today && dueDate <= endOfWeek;
      }

      return true; // Filtro 'all' (todas las pendientes)
    });
  };

  const filteredTodos = getFilteredTodos();

  // Helper para formatear fechas relativas
  const formatDueDate = (dateStr: string | null, timeStr: string | null) => {
    if (!dateStr) return null;

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    let relativeDate = '';
    if (dateStr === todayStr) {
      relativeDate = 'Hoy';
    } else if (dateStr === tomorrowStr) {
      relativeDate = 'Mañana';
    } else {
      const date = new Date(dateStr + 'T00:00:00');
      relativeDate = date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
    }

    if (timeStr) {
      const [hours, minutes] = timeStr.split(':');
      relativeDate += ` a las ${hours}:${minutes}`;
    }

    return relativeDate;
  };

  // Verificar si una fecha ya venció
  const isOverdue = (dateStr: string | null, completed: boolean) => {
    if (!dateStr || completed) return false;
    const todayStr = new Date().toISOString().split('T')[0];
    return dateStr < todayStr;
  };

  return (
    <div className={styles.container}>
      {/* Entrada rápida de tareas */}
      <form onSubmit={handleAddTodo} className={styles.quickAdd}>
        <input
          type="text"
          className="input"
          placeholder="Escribe una tarea rápida..."
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          disabled={loading && todos.length === 0}
        />
        <button type="submit" className="btn" aria-label="Agregar tarea">
          <svg style={{ width: '18px', height: '18px' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
      </form>

      {/* Barra de Filtros */}
      <div className={styles.filterBar}>
        <button
          onClick={() => setActiveFilter('all')}
          className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.filterBtnActive : ''}`}
        >
          Pendientes
        </button>
        <button
          onClick={() => setActiveFilter('today')}
          className={`${styles.filterBtn} ${activeFilter === 'today' ? styles.filterBtnActive : ''}`}
        >
          Hoy
        </button>
        <button
          onClick={() => setActiveFilter('week')}
          className={`${styles.filterBtn} ${activeFilter === 'week' ? styles.filterBtnActive : ''}`}
        >
          Próximos 7 días
        </button>
        <button
          onClick={() => setActiveFilter('completed')}
          className={`${styles.filterBtn} ${activeFilter === 'completed' ? styles.filterBtnActive : ''}`}
        >
          Completadas
        </button>
      </div>

      {/* Lista de Tareas */}
      {loading && todos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Cargando tus tareas...
        </div>
      ) : filteredTodos.length > 0 ? (
        <div className={styles.todoList}>
          {filteredTodos.map((todo) => {
            const dateFormatted = formatDueDate(todo.due_date, todo.due_time);
            const overdue = isOverdue(todo.due_date, todo.completed);

            return (
              <div
                key={todo.id}
                className={`${styles.todoItem} ${todo.completed ? styles.todoItemCompleted : ''}`}
              >
                {/* Checkbox personalizado */}
                <div className={styles.checkboxContainer}>
                  <button
                    onClick={() => handleToggleComplete(todo.id, todo.completed)}
                    className={`${styles.checkbox} ${todo.completed ? styles.checkboxActive : ''}`}
                    aria-label={todo.completed ? "Marcar como pendiente" : "Marcar como completada"}
                  >
                    {todo.completed && (
                      <svg className={styles.checkIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    )}
                  </button>
                </div>

                {/* Contenido de la Tarea */}
                <div className={styles.todoContent}>
                  <span className={`${styles.todoTitle} ${todo.completed ? styles.todoTitleCompleted : ''}`}>
                    {todo.title}
                  </span>
                  {todo.description && (
                    <span className={styles.todoDesc}>{todo.description}</span>
                  )}
                  
                  <div className={styles.todoMeta}>
                    {/* Badge de Categoría */}
                    <span className={`${styles.badge} ${styles[`badge-${todo.category}`] || styles['badge-general']}`}>
                      {todo.category}
                    </span>
                    
                    {/* Fecha de vencimiento */}
                    {dateFormatted && (
                      <span className={`${styles.todoDate} ${overdue ? styles.todoDateDanger : ''}`}>
                        <svg className={styles.dateIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                          <line x1="16" y1="2" x2="16" y2="6"></line>
                          <line x1="8" y1="2" x2="8" y2="6"></line>
                          <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        {overdue ? `Venció: ${dateFormatted}` : dateFormatted}
                      </span>
                    )}

                    {/* Botón de exportación .ics local */}
                    {todo.due_date && !todo.completed && (
                      <button
                        onClick={() => exportToIcs(todo)}
                        className={styles.exportIcsBtn}
                        title="Exportar recordatorio a mi calendario (.ics)"
                      >
                        <svg className={styles.exportIcsIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                          <polyline points="7 10 12 15 17 10"></polyline>
                          <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Calendario</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Botón Eliminar */}
                <button
                  onClick={() => handleDeleteTodo(todo.id)}
                  className={styles.deleteBtn}
                  aria-label="Eliminar tarea"
                >
                  <svg className={styles.deleteIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        /* Estado vacío */
        <div className={styles.emptyState}>
          <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <p style={{ fontSize: '15px', fontWeight: 600 }}>No hay tareas aquí</p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {activeFilter === 'completed' 
              ? 'Aún no has completado ninguna tarea.' 
              : 'Presiona el micrófono inferior y dicta una tarea o escríbela arriba.'}
          </p>
        </div>
      )}
    </div>
  );
}
