// Inductoria · Edge Function: actualizar-curso-ia
// ------------------------------------------------
// El dueño aprieta "Cambiar versión" sobre un curso publicado (el curso
// pasa a 'en_revision' y deja de verlo el empleado), escribe qué quiere
// cambiar o agregar, y esto le pide a Claude que regenere el curso
// completo (mismo formato que procesar-contenido) a partir del curso
// actual + lo nuevo. NUNCA crea un microcurso nuevo ni lo borra: actualiza
// el mismo registro para no perder el historial de los empleados.
//
// Versiones (2026-09-24, ver supabase/sql/2026-09-24-cursos-versiones.sql):
// esta función NO sube microcursos.version. Solo marca
// revision_con_cambios = true. La versión sube en 1 recién cuando el
// dueño vuelve a publicar (en_revision -> aprobado), y lo hace un trigger
// en la base. Así, varias actualizaciones con IA dentro de la misma
// revisión cuentan como una sola versión nueva.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { puedeUsarIA, MENSAJE_IA_BLOQUEADA_TRIAL } from '../_shared/acceso.ts';
import {
  envolverMaterialNoConfiable,
  validarCursoGenerado,
  instruccionesCurso,
  MAX_MATERIAL_CARACTERES,
  MENSAJE_RESPUESTA_CORTADA,
  extraerJson,
  sacarRayasDeTodo,
} from '../_shared/prompt-seguridad.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Esta función espera a la IA mientras el celular del dueño espera la
// respuesta. Cortamos antes de los 150 segundos de Supabase para poder
// devolver un mensaje claro en vez de un 504 sin explicación.
const TIMEOUT_CLAUDE_MS = 120_000;

// Tope para lo que escribe el dueño en "qué querés cambiar". El resto del
// material es el curso actual (5 pasos), que ya tiene un largo acotado.
const MAX_TEXTO_NUEVO_CARACTERES = 15_000;

function responder(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

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
      return responder({ error: 'No autorizado' }, 401);
    }

    const body = await req.json();
    const microcursoId = body.microcurso_id;
    const textoNuevo = (body.texto_nuevo || '').trim();

    if (!microcursoId || !textoNuevo) {
      return responder({ error: 'Falta el curso o lo que querés cambiar.' }, 400);
    }

    if (textoNuevo.length > MAX_TEXTO_NUEVO_CARACTERES) {
      return responder(
        { error: 'Lo que escribiste es muy largo, dividilo en partes. Probá con hasta 15.000 caracteres por vez.' },
        400
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Confirmamos que el curso sea de una cuenta del usuario que llama.
    const { data: microcurso, error: microcursoError } = await supabase
      .from('microcursos')
      .select('*, cuentas!inner(owner_id, plan, trial_ends_at)')
      .eq('id', microcursoId)
      .single();

    if (microcursoError || !microcurso || microcurso.cuentas.owner_id !== user.id) {
      return responder({ error: 'No encontramos ese curso.' }, 404);
    }

    // Actualizar/regenerar con IA tiene el mismo costo que generar un
    // curso nuevo: tampoco disponible en trial.
    if (!puedeUsarIA(microcurso.cuentas, user.email)) {
      return responder({ error: MENSAJE_IA_BLOQUEADA_TRIAL }, 403);
    }

    // El flujo de la app es: "Cambiar versión" (pasa a 'en_revision') y
    // recién ahí "Actualizar con IA". Antes esta función exigía 'aprobado'
    // y por eso el flujo real fallaba siempre con "no está publicado".
    // Solo aceptamos 'en_revision': cambiar el contenido de un curso que
    // los empleados están viendo en ese momento dejaría la versión
    // desincronizada.
    if (microcurso.estado !== 'en_revision') {
      return responder(
        { error: 'Para cambiar este curso primero tocá "Cambiar versión" en Cursos disponibles.' },
        400
      );
    }

    // Material de base: el curso tal como está ahora (ya integra todo lo
    // que se fue sumando en actualizaciones anteriores). Antes se usaba el
    // texto original + todo lo nuevo, y ese combinado se guardaba de vuelta
    // en el contenido, así que cada actualización mandaba más texto que la
    // anterior (y costaba más). Ahora la entrada queda acotada al curso
    // actual + el pedido nuevo, y no se guarda nada acumulado.
    const { data: pasosActuales, error: pasosActualesError } = await supabase
      .from('pasos')
      .select('titulo, contenido')
      .eq('microcurso_id', microcursoId)
      .order('orden', { ascending: true });

    if (pasosActualesError) {
      console.error('No se pudieron leer los pasos actuales:', pasosActualesError);
      return responder({ error: 'No pudimos leer el curso actual. Probá de nuevo.' }, 500);
    }

    let materialPrevio = (pasosActuales || []).map((p) => `${p.titulo}\n${p.contenido}`).join('\n\n');

    // Curso sin pasos (pasaba cuando fallaba el reemplazo viejo): usamos
    // el material original si existe.
    const { data: contenidoOriginal } = await supabase
      .from('contenidos')
      .select('id, texto_procesado')
      .eq('microcurso_id', microcursoId)
      .limit(1)
      .maybeSingle();
    if (!materialPrevio.trim() && contenidoOriginal?.texto_procesado) {
      materialPrevio = contenidoOriginal.texto_procesado;
    }

    const textoCombinado = `Curso actual (título: ${microcurso.titulo}):\n${materialPrevio}\n\nCambios o agregados que pide el dueño:\n${textoNuevo}`;

    if (textoCombinado.length > MAX_MATERIAL_CARACTERES) {
      return responder(
        { error: 'El curso con lo que querés sumar queda muy largo. Dividilo en partes o armá un curso aparte para el tema nuevo.' },
        400
      );
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;

    const instrucciones = instruccionesCurso(
      '- El material que te pasan es un curso que ya existe más un pedido del dueño con cambios o cosas para agregar. Aplicá lo que pide y armá un curso único y coherente, sin tratarlo como dos partes separadas. Lo que el dueño no pidió cambiar, dejalo con el mismo sentido que tenía.'
    );

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
          max_tokens: 6000,
          system: instrucciones,
          messages: [{ role: 'user', content: envolverMaterialNoConfiable(textoCombinado) }],
        }),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
        return responder({ error: 'La IA tardó demasiado en responder. Probá de nuevo con un pedido más corto.' }, 504);
      }
      console.error('No se pudo conectar con Claude:', fetchErr);
      return responder({ error: 'No pudimos conectar con la IA. Probá de nuevo.' }, 502);
    }
    clearTimeout(timeoutId);

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Error de Claude:', errText);
      return responder({ error: 'No se pudo actualizar el curso. Probá de nuevo.' }, 500);
    }

    const claudeData = await claudeRes.json();
    const textoRespuesta = claudeData.content?.[0]?.text || '';

    const usage = claudeData.usage || {};
    const inputTokens = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const costoUsd = (inputTokens / 1_000_000) * 1.0 + (outputTokens / 1_000_000) * 5.0;

    const { error: usageError } = await supabase.from('ai_usage_log').insert({
      cuenta_id: microcurso.cuenta_id,
      contenido_id: contenidoOriginal?.id || null,
      model: 'claude-haiku-4-5-20251001',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      costo_usd: costoUsd,
    });
    if (usageError) console.error('No se pudo registrar el costo de IA:', usageError);

    if (claudeData.stop_reason === 'max_tokens') {
      console.error('Respuesta de Claude cortada por max_tokens', { microcursoId, outputTokens });
      return responder({ error: MENSAJE_RESPUESTA_CORTADA }, 422);
    }

    const jsonCrudo = extraerJson(textoRespuesta);
    if (!jsonCrudo) {
      console.error('No se pudo parsear la respuesta de Claude:', textoRespuesta);
      return responder({ error: 'La IA devolvió una respuesta que no pudimos leer. Probá de nuevo.' }, 500);
    }
    // deno-lint-ignore no-explicit-any
    const cursoRegenerado: any = sacarRayasDeTodo(jsonCrudo);

    // Misma validación de forma que procesar-contenido: última barrera
    // contra una inyección metida en el material antes de pisar el curso.
    const errorValidacion = validarCursoGenerado(cursoRegenerado);
    if (errorValidacion) {
      console.error('Curso regenerado con formato inválido:', errorValidacion, textoRespuesta);
      return responder({ error: 'La IA devolvió un curso con un formato inesperado. Probá de nuevo.' }, 500);
    }

    const duracion = Number.isFinite(Number(cursoRegenerado.duracion_min))
      ? Math.max(1, Math.round(Number(cursoRegenerado.duracion_min)))
      : null;
    const pasosNuevos = (cursoRegenerado.pasos || []).map((p: { titulo: string; contenido: string }) => ({
      titulo: p.titulo,
      contenido: p.contenido,
    }));

    // Reemplazo atómico (una sola transacción en la base): datos del
    // curso + borrar pasos viejos + insertar los nuevos + marcar
    // revision_con_cambios. Si algo falla, el curso queda como estaba.
    // Antes se borraban los pasos y después se insertaban, y un insert
    // fallido dejaba un curso sin pasos.
    const { error: rpcError } = await supabase.rpc('reemplazar_contenido_curso', {
      p_microcurso_id: microcursoId,
      p_titulo: cursoRegenerado.titulo,
      p_duracion_min: duracion,
      p_preguntas: cursoRegenerado.preguntas || [],
      p_pasos: pasosNuevos,
    });

    if (rpcError) {
      // Si la función SQL todavía no existe (no se corrió el SQL del
      // 2026-09-24), usamos un reemplazo sin transacción pero seguro:
      // primero insertamos los pasos nuevos y solo si salió bien borramos
      // los viejos. Así nunca queda el curso sin pasos.
      const noExiste = rpcError.code === 'PGRST202' || rpcError.code === '42883';
      if (!noExiste) {
        console.error('Error en reemplazar_contenido_curso:', rpcError);
        return responder({ error: 'No se pudo guardar el curso actualizado. El curso quedó como estaba, probá de nuevo.' }, 500);
      }
      console.warn('reemplazar_contenido_curso no existe, uso el reemplazo sin transacción');
      const fallo = await reemplazoSinTransaccion(supabase, microcursoId, cursoRegenerado, duracion, pasosNuevos);
      if (fallo) {
        console.error('Reemplazo sin transacción falló:', fallo);
        return responder({ error: 'No se pudo guardar el curso actualizado. El curso quedó como estaba, probá de nuevo.' }, 500);
      }
    }

    return responder({ ok: true, titulo: cursoRegenerado.titulo });
  } catch (err) {
    console.error(err);
    return responder({ error: 'Algo salió mal al actualizar el curso. Probá de nuevo.', detalle: String(err) }, 500);
  }
});

// Plan B cuando la función SQL no está instalada. Devuelve el error, o
// null si salió todo bien.
async function reemplazoSinTransaccion(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  microcursoId: string,
  // deno-lint-ignore no-explicit-any
  curso: any,
  duracion: number | null,
  pasosNuevos: { titulo: string; contenido: string }[]
): Promise<unknown> {
  const { data: viejos, error: viejosError } = await supabase
    .from('pasos')
    .select('id')
    .eq('microcurso_id', microcursoId);
  if (viejosError) return viejosError;

  const { error: insertError } = await supabase.from('pasos').insert(
    pasosNuevos.map((p, i) => ({ microcurso_id: microcursoId, orden: i + 1, titulo: p.titulo, contenido: p.contenido }))
  );
  if (insertError) return insertError;

  const idsViejos = (viejos || []).map((p: { id: string }) => p.id);
  if (idsViejos.length > 0) {
    const { error: deleteError } = await supabase.from('pasos').delete().in('id', idsViejos);
    if (deleteError) return deleteError;
  }

  const { error: updateError } = await supabase
    .from('microcursos')
    .update({
      titulo: curso.titulo,
      duracion_min: duracion,
      preguntas: curso.preguntas || [],
      actualizado_at: new Date().toISOString(),
    })
    .eq('id', microcursoId);
  return updateError || null;
}
