// Inductoria · Edge Function: generar-procedimiento
// ------------------------------------------------
// El dueño aprieta "Generar procedimiento con IA" sobre un contenido
// puntual (el mismo material que ya usa para generar cursos). Esto le
// manda el texto a Claude (Haiku, el modelo más barato) y le pide que
// lo convierta en un procedimiento prolijo: objetivo, alcance,
// qué necesitás a mano, pasos numerados en modo instructivo corto, y
// qué hacer ante excepciones. Se guarda en estado "pendiente" (borrador,
// el dueño lo revisa, completa el responsable si hace falta, y lo
// aprueba antes de descargarlo en PDF para imprimir o compartir).
//
// Es un output PARALELO e independiente de "Generar curso con IA": el
// mismo contenido aprobado puede usarse para generar un curso, un
// procedimiento, o los dos — por eso esta función nunca toca
// contenidos.estado ni contenidos.microcurso_id (a diferencia de
// procesar-contenido, que sí marca el contenido como "procesado").
//
// Se dispara a mano por diseño, igual que generar-curso, para que el
// costo de la IA quede bajo control del dueño.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { puedeUsarIA, MENSAJE_IA_BLOQUEADA_TRIAL_PROCEDIMIENTO } from '../_shared/acceso.ts';
import {
  AVISO_MATERIAL_NO_CONFIABLE,
  envolverMaterialNoConfiable,
  validarProcedimientoGenerado,
  REGLAS_DE_ESTILO,
  MAX_MATERIAL_CARACTERES,
  MENSAJE_MATERIAL_MUY_LARGO,
  MENSAJE_RESPUESTA_CORTADA,
  extraerJson,
  sacarRayasDeTodo,
} from '../_shared/prompt-seguridad.ts';

// Cortamos antes de los 150 segundos de Supabase para devolver un
// mensaje claro en vez de un 504.
const TIMEOUT_CLAUDE_MS = 120_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const contenidoId = body.contenido_id;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Traemos el contenido, y confirmamos que sea de una cuenta del usuario que llama.
    const { data: contenido, error: contenidoError } = await supabase
      .from('contenidos')
      .select('*, cuentas!inner(owner_id, plan, trial_ends_at)')
      .eq('id', contenidoId)
      .single();

    if (contenidoError || !contenido || contenido.cuentas.owner_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Contenido no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Igual que generar el curso: nunca disponible en trial, aunque el
    // resto de la app sí. Se valida acá (no solo en el frontend) porque
    // cualquiera podría llamar esta función directo con el token del usuario.
    if (!puedeUsarIA(contenido.cuentas, user.email)) {
      return new Response(JSON.stringify({ error: MENSAJE_IA_BLOQUEADA_TRIAL_PROCEDIMIENTO }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (contenido.estado === 'pendiente') {
      return new Response(
        JSON.stringify({ error: 'Marcá el contenido como aprobado antes de generar el procedimiento' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

    const material = (contenido.texto_procesado || '').trim();
    if (!material) {
      return new Response(
        JSON.stringify({ error: 'El contenido está vacío. Escribí o subí el material antes de generar el procedimiento.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (material.length > MAX_MATERIAL_CARACTERES) {
      return new Response(JSON.stringify({ error: MENSAJE_MATERIAL_MUY_LARGO }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instrucciones = `${AVISO_MATERIAL_NO_CONFIABLE}

Convertí el material de capacitación de un comercio que te van a pasar en un procedimiento claro y accionable, del tipo que un empleado pueda tener impreso al lado del mostrador y seguir paso a paso sin dudas.

Reglas de contenido:
- "objetivo": 1 o 2 oraciones cortas: qué se logra siguiendo este procedimiento y por qué importa.
- "alcance": 1 oración corta: quién lo tiene que seguir y cuándo aplica (por ejemplo, en qué momento del turno o ante qué situación).
- "materiales": array de strings, cada uno algo concreto que hace falta tener a mano antes de arrancar (herramientas, planillas, insumos, accesos). Si el material no menciona nada, poné solo lo mínimo y genérico que se deduce del contexto; si no aplica nada, array vacío.
- "pasos": array de strings, cada uno UN paso concreto, escrito en imperativo con voseo ("Verificá...", "Contá...", "Avisale al encargado..."), corto (una oración, máximo dos), en el orden real en que se hacen. Nada de párrafos largos: si el material trae explicaciones largas, resumilas en la acción concreta.
- "excepciones": array de objetos {"condicion": "string corto", "accion": "string corto"}, cada uno una situación que se sale del flujo normal (un problema, una duda, un caso límite) y qué hacer en ese caso. Si el material no menciona ninguna, sumá 1 o 2 genéricas que se deduzcan del contexto (por ejemplo, qué hacer si falta algo o si hay una diferencia: avisarle al encargado), sin inventar normas, cifras, nombres ni horarios.
- "titulo": string corto y concreto, en formato oración (ejemplo: "Apertura de caja", "Recepción de mercadería").
- "area": string corto con el área a la que pertenece (ejemplo: "Caja", "Depósito", "Atención al cliente", "Seguridad"), la que mejor represente el tema.
- Tono directo y sin vueltas, hablándole al empleado de vos: es una guía de uso rápido, no una explicación.
- Todo lo que agregues por tu cuenta (materiales, pasos o excepciones que no están en el material) tiene que ser genérico. No agregues datos concretos que no estén en el original.

${REGLAS_DE_ESTILO}

Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, con esta forma exacta:
{
  "titulo": "string",
  "area": "string",
  "objetivo": "string",
  "alcance": "string",
  "materiales": ["string"],
  "pasos": ["string"],
  "excepciones": [{"condicion": "string", "accion": "string"}]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CLAUDE_MS);
    let claudeRes: Response;
    try {
      claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 3000,
          system: instrucciones,
          messages: [{ role: 'user', content: envolverMaterialNoConfiable(material) }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'La IA tardó demasiado en responder. Probá de nuevo. Si el contenido es muy largo, dividilo en partes.' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('No se pudo conectar con Claude:', fetchErr);
      return new Response(JSON.stringify({ error: 'No pudimos conectar con la IA. Probá de nuevo.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    clearTimeout(timeoutId);
    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Error de Claude:', errText);
      return new Response(JSON.stringify({ error: 'No se pudo generar el procedimiento. Probá de nuevo.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await claudeRes.json();
    const textoRespuesta = claudeData.content?.[0]?.text || '';

    // Costo real según tokens que devuelve la propia API (no una estimación).
    // Mismos precios que procesar-contenido: Claude Haiku 4.5, USD 1.00 /
    // millón de tokens de entrada, USD 5.00 / millón de tokens de salida.
    const usage = claudeData.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    const { error: usageError } = await supabase.from('ai_usage_log').insert({
      cuenta_id: contenido.cuenta_id,
      contenido_id: contenidoId,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });
    if (usageError) console.error('No se pudo registrar el costo de IA:', usageError);

    // Respuesta cortada por falta de espacio: el JSON vendría incompleto.
    if (claudeData.stop_reason === 'max_tokens') {
      console.error('Respuesta de Claude cortada por max_tokens', { contenidoId, outputTokens });
      return new Response(JSON.stringify({ error: MENSAJE_RESPUESTA_CORTADA }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tolera ```json ... ``` o texto suelto alrededor del JSON.
    const jsonCrudo = extraerJson(textoRespuesta);
    if (!jsonCrudo) {
      console.error('No se pudo parsear la respuesta de Claude:', textoRespuesta);
      return new Response(JSON.stringify({ error: 'La IA devolvió una respuesta que no pudimos leer. Probá de nuevo.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // El prompt pide no usar rayas, pero por las dudas las sacamos acá.
    // deno-lint-ignore no-explicit-any
    const procedimientoGenerado: any = sacarRayasDeTodo(jsonCrudo);

    // Misma validación de forma que procesar-contenido, y por el mismo
    // motivo: última barrera contra una inyección metida en el material
    // antes de que llegue a guardarse como procedimiento.
    const errorValidacion = validarProcedimientoGenerado(procedimientoGenerado);
    if (errorValidacion) {
      console.error('Procedimiento generado con formato inválido:', errorValidacion, textoRespuesta);
      return new Response(
        JSON.stringify({ error: 'La IA devolvió un procedimiento con un formato inesperado. Probá de nuevo.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Se crea como BORRADOR (pendiente): el dueño lo revisa, completa el
    // responsable si hace falta, y recién ahí lo aprueba desde la
    // pantalla de Procedimientos. No toca contenidos.estado ni
    // contenidos.microcurso_id — es un output independiente del curso.
    const { data: procedimiento, error: procedimientoError } = await supabase
      .from('procedimientos')
      .insert({
        cuenta_id: contenido.cuenta_id,
        contenido_id: contenidoId,
        titulo: procedimientoGenerado.titulo || 'Procedimiento sin título',
        area: procedimientoGenerado.area || null,
        estado: 'pendiente',
        objetivo: procedimientoGenerado.objetivo || null,
        alcance: procedimientoGenerado.alcance || null,
        materiales: procedimientoGenerado.materiales || [],
        pasos: procedimientoGenerado.pasos || [],
        excepciones: procedimientoGenerado.excepciones || [],
      })
      .select()
      .single();

    if (procedimientoError) throw procedimientoError;

    return new Response(JSON.stringify({ procedimiento_id: procedimiento.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Algo salió mal al generar el procedimiento. Probá de nuevo.', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
