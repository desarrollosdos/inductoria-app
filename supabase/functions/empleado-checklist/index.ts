// Inductoria · Edge Function: empleado-checklist
// ------------------------------------------------
// Pantalla nueva para el empleado: ver y marcar los checklists operativos
// activos que le corresponden en su sucursal (armados por el dueño en
// Checklists.jsx). Usa el mismo token de acceso que ya tiene para "Mi
// perfil" y los cursos — no hace falta un link ni un PIN nuevo.
//
// Ahora puede haber MÁS DE UN checklist activo por sucursal, cada uno
// aplicable a puestos puntuales (por ejemplo "Cierre de caja" solo para
// cajeros) — mismo criterio que ya se usa para microcursos.puestos_aplicables:
// sin puestos_aplicables (null o vacío) = todavía no publicado para nadie;
// ['TODOS'] = para cualquier puesto; lista puntual = solo esos puestos.
// El filtro se aplica tanto al listar (GET) como al validar el envío
// (POST), para que no se pueda marcar un checklist por afuera del rol
// aunque alguien arme el pedido a mano.
//
// No hay estado por ítem persistido: el empleado tilda todos los ítems en
// la pantalla y al enviar se guarda una sola fila en checklist_runs por
// checklist por día, marcando que se completó y quién lo hizo.
//
// 2026-09-24: valida token + PIN en cada pedido (el mismo PIN de Mi
// perfil, en el header x-empleado-pin, ver _shared/empleado-auth.ts), usa
// la fecha de Argentina para el período, y si dos personas envían el
// mismo checklist a la vez el índice único (checklist_id, fecha) frena el
// duplicado y se responde 409.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  ahoraArgentina,
  aplicaAlPuesto,
  autenticarEmpleado,
  corsEmpleado,
  leerPin,
  respuestaError,
  respuestaErrorServidor,
  respuestaJson,
} from '../_shared/empleado-auth.ts';

// Mismo cálculo de "ancla de período" que usa Checklists.jsx (pantalla del
// dueño), para que ambos lados coincidan en qué fecha representa "ya
// completado en el período actual": el día exacto si es diario, el lunes
// de esa semana si es semanal, o el día 1 del mes si es mensual.
// `base` tiene que venir ya corrida a hora de Argentina (ver
// anclaActual): se lee con los getters UTC.
function fechaAncla(periodicidad: string, base: Date) {
  if (periodicidad === 'semanal') {
    const dia = base.getUTCDay(); // 0 = domingo
    const diff = (dia === 0 ? -6 : 1) - dia;
    const lunes = new Date(base);
    lunes.setUTCDate(base.getUTCDate() + diff);
    return lunes.toISOString().slice(0, 10);
  }
  if (periodicidad === 'mensual') {
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return base.toISOString().slice(0, 10);
}

// 2026-09-24: el "hoy" es el de Argentina. Antes se usaba la fecha UTC,
// así que a partir de las 21 hs el checklist de hoy ya contaba como el de
// mañana (y un cierre de caja hecho a la noche quedaba en el día que no era).
function anclaActual(periodicidad: string) {
  return fechaAncla(periodicidad, ahoraArgentina());
}

function etiquetaDePeriodo(periodicidad: string) {
  return periodicidad === 'semanal' ? 'esta semana' : periodicidad === 'mensual' ? 'este mes' : 'hoy';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsEmpleado });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');

      const auth = await autenticarEmpleado(supabase, token, leerPin(req));
      if (auth.error) return respuestaError(auth.error);
      const empleado = auth.empleado;

      const { data: negocio } = await supabase
        .from('negocios')
        .select('cuenta_id')
        .eq('id', empleado.negocio_id)
        .single();

      const { data: cuenta } = await supabase
        .from('cuentas')
        .select('checklists_habilitado')
        .eq('id', negocio?.cuenta_id)
        .single();

      if (!cuenta?.checklists_habilitado) {
        return respuestaJson({ checklists: [] });
      }

      const { data: checklistsNegocio, error: checklistsError } = await supabase
        .from('checklists')
        .select('id, titulo, periodicidad, puestos_aplicables, checklist_items(id, texto, orden)')
        .eq('negocio_id', empleado.negocio_id)
        .eq('activo', true);

      if (checklistsError) throw checklistsError;

      const checklistsDelPuesto = (checklistsNegocio || []).filter((c: any) =>
        aplicaAlPuesto(c.puestos_aplicables, empleado.puesto)
      );

      if (checklistsDelPuesto.length === 0) {
        return respuestaJson({ checklists: [] });
      }

      // Cada checklist puede tener su propia periodicidad, así que la
      // "fila del período actual" se busca contra el ancla de CADA uno
      // (no siempre contra el día de hoy).
      const { data: runsRecientes } = await supabase
        .from('checklist_runs')
        .select('checklist_id, fecha, empleado_nombre')
        .in(
          'checklist_id',
          checklistsDelPuesto.map((c: any) => c.id)
        );

      const checklists = checklistsDelPuesto.map((c: any) => {
        const periodicidad = c.periodicidad || 'diario';
        const ancla = anclaActual(periodicidad);
        const items = (c.checklist_items || [])
          .slice()
          .sort((a: any, b: any) => a.orden - b.orden)
          .map((i: any) => ({ id: i.id, texto: i.texto }));
        const run = (runsRecientes || []).find(
          (r: any) => r.checklist_id === c.id && r.fecha === ancla
        );
        return {
          id: c.id,
          titulo: c.titulo,
          periodicidad,
          items,
          completado_hoy: !!run,
          completado_por: run?.empleado_nombre ?? null,
        };
      });

      return respuestaJson({ checklists });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const { token, checklist_id } = body || {};

      const auth = await autenticarEmpleado(supabase, token, leerPin(req));
      if (auth.error) return respuestaError(auth.error);
      const empleado = auth.empleado;

      if (!checklist_id) {
        return respuestaJson({ error: 'No encontramos ese checklist. Volvé a Mi perfil y probá de nuevo.' }, 400);
      }

      const { data: checklist, error: checklistError } = await supabase
        .from('checklists')
        .select('id, negocio_id, activo, periodicidad, puestos_aplicables')
        .eq('id', checklist_id)
        .maybeSingle();

      if (checklistError) console.error('empleado-checklist:', checklistError);
      if (
        checklistError ||
        !checklist ||
        checklist.negocio_id !== empleado.negocio_id ||
        !checklist.activo ||
        !aplicaAlPuesto(checklist.puestos_aplicables, empleado.puesto)
      ) {
        return respuestaJson({ error: 'Este checklist ya no está disponible para vos.' }, 404);
      }

      const periodicidad = checklist.periodicidad || 'diario';
      const fecha = anclaActual(periodicidad);
      const etiquetaPeriodo = etiquetaDePeriodo(periodicidad);

      // Las filas de checklist_runs son una por checklist por período (no
      // por empleado): si otro compañero ya lo completó, no se duplica.
      async function respuestaYaCompletado() {
        const { data: yaCompletado } = await supabase
          .from('checklist_runs')
          .select('empleado_nombre')
          .eq('checklist_id', checklist_id)
          .eq('fecha', fecha)
          .limit(1);
        const quien = yaCompletado?.[0]?.empleado_nombre;
        return respuestaJson(
          {
            error: quien
              ? `Este checklist ya lo completó ${quien} ${etiquetaPeriodo}.`
              : `Este checklist ya está completado ${etiquetaPeriodo}.`,
            ya_completado: true,
          },
          409
        );
      }

      const { data: existentes } = await supabase
        .from('checklist_runs')
        .select('checklist_id')
        .eq('checklist_id', checklist_id)
        .eq('fecha', fecha)
        .limit(1);

      if (existentes && existentes.length > 0) {
        return await respuestaYaCompletado();
      }

      const ahora = new Date().toISOString();

      const { error: insertError } = await supabase.from('checklist_runs').insert({
        checklist_id,
        negocio_id: empleado.negocio_id,
        empleado_id: empleado.id,
        fecha,
        empleado_nombre: empleado.nombre,
        completado_en: ahora,
      });

      if (insertError) {
        // 23505 = violación del índice único (checklist_id, fecha): dos
        // envíos casi al mismo tiempo, el otro ganó.
        if (insertError.code === '23505') return await respuestaYaCompletado();
        throw insertError;
      }

      return respuestaJson({ ok: true });
    }

    return respuestaJson({ error: 'Método no permitido.' }, 405);
  } catch (err) {
    return respuestaErrorServidor(err);
  }
});
