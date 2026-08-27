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

import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mismo cálculo de "ancla de período" que usa Checklists.jsx (pantalla del
// dueño), para que ambos lados coincidan en qué fecha representa "ya
// completado en el período actual": el día exacto si es diario, el lunes
// de esa semana si es semanal, o el día 1 del mes si es mensual.
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

function anclaActual(periodicidad: string) {
  return fechaAncla(periodicidad, new Date());
}

// Mismo criterio que empleado-info usa para microcursos.puestos_aplicables.
function aplicaAlPuesto(puestos: string[] | null, puestoEmpleado: string | null) {
  if (!puestos || puestos.length === 0) return false;
  if (puestos.includes('TODOS')) return true;
  return !!puestoEmpleado && puestos.includes(puestoEmpleado);
}

async function cargarEmpleado(supabase: any, token: string) {
  const { data: empleado, error: empleadoError } = await supabase
    .from('empleados')
    .select('id, nombre, puesto, negocio_id, fecha_baja')
    .eq('token_acceso', token)
    .maybeSingle();

  if (empleadoError) throw empleadoError;
  if (!empleado || empleado.fecha_baja) return null;
  return empleado;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const token = url.searchParams.get('token');
      if (!token) {
        return new Response(JSON.stringify({ error: 'Falta el token' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const empleado = await cargarEmpleado(supabase, token);
      if (!empleado) {
        return new Response(JSON.stringify({ error: 'Link no válido o de baja' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

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
        return new Response(JSON.stringify({ checklists: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
        return new Response(JSON.stringify({ checklists: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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

      return new Response(JSON.stringify({ checklists }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method === 'POST') {
      const body = await req.json();
      const { token, checklist_id } = body;

      if (!token || !checklist_id) {
        return new Response(JSON.stringify({ error: 'Faltan datos' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const empleado = await cargarEmpleado(supabase, token);
      if (!empleado) {
        return new Response(JSON.stringify({ error: 'Link no válido o de baja' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: checklist, error: checklistError } = await supabase
        .from('checklists')
        .select('id, negocio_id, activo, periodicidad, puestos_aplicables')
        .eq('id', checklist_id)
        .maybeSingle();

      if (checklistError) throw checklistError;
      if (
        !checklist ||
        checklist.negocio_id !== empleado.negocio_id ||
        !checklist.activo ||
        !aplicaAlPuesto(checklist.puestos_aplicables, empleado.puesto)
      ) {
        return new Response(JSON.stringify({ error: 'Checklist no encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const periodicidad = checklist.periodicidad || 'diario';
      const fecha = anclaActual(periodicidad);
      const etiquetaPeriodo =
        periodicidad === 'semanal' ? 'esta semana' : periodicidad === 'mensual' ? 'este mes' : 'hoy';

      const { data: yaCompletado } = await supabase
        .from('checklist_runs')
        .select('empleado_nombre')
        .eq('checklist_id', checklist_id)
        .eq('fecha', fecha)
        .maybeSingle();

      if (yaCompletado) {
        return new Response(
          JSON.stringify({
            error: `Este checklist ya lo completó ${yaCompletado.empleado_nombre} ${etiquetaPeriodo}.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
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

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Error inesperado', detalle: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
