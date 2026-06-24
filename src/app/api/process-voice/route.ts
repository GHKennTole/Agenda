import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Función para extraer JSON de forma segura, eliminando posibles bloques de código markdown
function extractJson(text: string) {
  const cleanText = text.trim();
  const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonStr = match ? match[1] : cleanText;
  return JSON.parse(jsonStr.trim());
}

export async function POST(request: Request) {
  try {
    // 1. Obtener la transcripción del cuerpo de la petición
    const { text } = await request.json();

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'El texto está vacío' }, { status: 400 });
    }

    // 2. Crear cliente de Supabase y verificar autenticación del usuario
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado. Inicia sesión.' }, { status: 401 });
    }

    // 3. Preparar la fecha actual en español para inyectarla en el prompt de Gemini
    const now = new Date();
    // Ajustar a la zona horaria del usuario si es necesario, por ahora usamos la del servidor local
    const formattedDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateStringSpanish = now.toLocaleDateString('es-ES', options);

    // 4. Configurar el prompt para Gemini
    const systemPrompt = `
Eres la inteligencia artificial de una agenda personal. Tu tarea es analizar el texto dictado por el usuario (en español) y estructurarlo.
Debes decidir si lo dictado se trata de una TAREA (algo con una fecha, hora o acción pendiente, ej: "recordar comprar café mañana a las 3", "reunión el viernes") o de una NOTA general (información, ideas o apuntes que no tienen fecha de vencimiento, ej: "esta es una nota sobre mis vacaciones", "apuntar ideas de negocio").

Información de contexto temporal:
- Hoy es: ${dateStringSpanish} (Fecha en formato YYYY-MM-DD: ${formattedDate}).
Usa esta fecha como referencia absoluta para calcular fechas relativas como "mañana", "este viernes", "el próximo lunes", "dentro de 3 días", etc.

Debes responder ÚNICAMENTE con un objeto JSON estructurado que coincida exactamente con uno de los dos siguientes esquemas, sin explicaciones ni markdown fuera del JSON:

Si decides que es una TAREA (type = "todo"):
{
  "type": "todo",
  "data": {
    "title": "Título resumido y claro de la tarea",
    "description": "Detalles adicionales (si se mencionan) o el texto original si no hay más detalles",
    "due_date": "YYYY-MM-DD" (fecha calculada relativa a hoy, obligatorio para tareas),
    "due_time": "HH:MM:SS" (formato de 24 horas, o null si no se especifica hora),
    "category": "trabajo" | "personal" | "salud" | "ideas" | "general" (elige la más adecuada)
  }
}

Si decides que es una NOTA (type = "note"):
{
  "type": "note",
  "data": {
    "title": "Título corto y descriptivo resumido para la nota",
    "content": "El contenido completo estructurado y redactado de forma limpia"
  }
}

Texto dictado por el usuario:
"${text}"
`;

    // 5. Llamar a la API de Gemini
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clave de API de Gemini no configurada' }, { status: 500 });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    let geminiResponse: Response | null = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: systemPrompt
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json'
            }
          })
        });

        // Si la respuesta es exitosa, o es un error que no sea 503, salimos del bucle
        // Si es 429 (cuota excedida), no tiene sentido reintentar de inmediato, salimos.
        if (geminiResponse.ok || geminiResponse.status !== 503) {
          break;
        }

        console.warn(`Intento ${attempt} de ${maxAttempts} falló con 503 (Servicio Ocupado). Reintentando...`);
      } catch (fetchErr) {
        console.error(`Error de red en intento ${attempt}:`, fetchErr);
        if (attempt === maxAttempts) throw fetchErr;
      }

      // Espera exponencial corta si vamos a reintentar
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }

    if (!geminiResponse) {
      return NextResponse.json({ error: 'No se recibió respuesta de la IA.' }, { status: 500 });
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Error de la API de Gemini:', errorText);
      
      try {
        const errJson = JSON.parse(errorText);
        const code = errJson.error?.code;
        const msg = errJson.error?.message;
        
        if (code === 429) {
          return NextResponse.json(
            { error: 'Has agotado tu cuota de solicitudes gratuitas de Gemini. Por favor, espera un minuto o revisa los límites en tu panel de Google AI Studio.' },
            { status: 429 }
          );
        }
        
        if (code === 503) {
          return NextResponse.json(
            { error: 'La IA de Google está experimentando una alta demanda en este momento. Por favor, vuelve a tocar el micrófono en unos segundos.' },
            { status: 503 }
          );
        }
        
        return NextResponse.json(
          { error: msg || 'Fallo en la comunicación con el servicio de IA.' },
          { status: geminiResponse.status }
        );
      } catch {
        return NextResponse.json({ error: 'Fallo al comunicarse con el servicio de IA.' }, { status: 500 });
      }
    }

    const geminiData = await geminiResponse.json();
    const candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidateText) {
      return NextResponse.json({ error: 'La IA no devolvió ninguna respuesta válida.' }, { status: 502 });
    }

    // 6. Parsear el JSON devuelto por Gemini
    const structuredResult = extractJson(candidateText);
    const { type, data } = structuredResult;

    // 7. Guardar en la tabla correspondiente de Supabase
    if (type === 'todo') {
      const { data: insertedTodo, error: dbError } = await supabase
        .from('todos')
        .insert([
          {
            user_id: user.id,
            title: data.title,
            description: data.description || null,
            due_date: data.due_date || null,
            due_time: data.due_time || null,
            category: data.category || 'general',
            completed: false
          }
        ])
        .select()
        .single();

      if (dbError) throw dbError;
      return NextResponse.json({ success: true, type: 'todo', item: insertedTodo });

    } else if (type === 'note') {
      const { data: insertedNote, error: dbError } = await supabase
        .from('notes')
        .insert([
          {
            user_id: user.id,
            title: data.title,
            content: data.content
          }
        ])
        .select()
        .single();

      if (dbError) throw dbError;
      return NextResponse.json({ success: true, type: 'note', item: insertedNote });
    } else {
      throw new Error('Tipo de elemento desconocido devuelto por la IA.');
    }

  } catch (err: any) {
    console.error('Error en /api/process-voice:', err);
    return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
  }
}
