-- Inductoria · 2026-09-24 · Seguridad del acceso de empleados
-- ------------------------------------------------------------
-- IMPORTANTE: correr este archivo completo en Supabase > SQL Editor ANTES
-- de desplegar las Edge Functions del empleado (verificar-empleado,
-- empleado-info, empleado-curso, empleado-completar-curso,
-- empleado-checklist, confirmar-acuse, preguntar-curso).
--
-- Se puede correr más de una vez sin problema (todo es "si no existe").
--
-- Qué hace:
-- 1. Agrega a `empleados` las columnas para frenar a quien intente
--    adivinar el PIN: después de 5 PIN incorrectos seguidos, ese empleado
--    queda bloqueado 15 minutos (lo maneja _shared/empleado-auth.ts).
-- 2. (Ya estaba resuelto en la base, ver abajo.) Evita checklists duplicados: una sola fila en `checklist_runs` por
--    checklist por período (día, semana o mes, según el checklist). Así
--    es como el código ya lo trata (se busca por checklist_id + fecha, no
--    por empleado), pero sin este índice dos envíos simultáneos podían
--    guardar dos filas. negocio_id no hace falta en la clave porque cada
--    checklist pertenece a un solo negocio.
--    Si ya hubiera duplicados (por ese mismo problema), se deja la fila
--    más temprana de cada período y se borran las repetidas, porque si no
--    el índice no se puede crear.

-- 1. Bloqueo por PIN incorrecto ------------------------------------------

alter table public.empleados
  add column if not exists pin_intentos_fallidos integer not null default 0;

alter table public.empleados
  add column if not exists pin_bloqueado_hasta timestamptz;

-- Por si la columna ya existía creada a mano sin valor por defecto.
update public.empleados set pin_intentos_fallidos = 0 where pin_intentos_fallidos is null;

-- 2. Un checklist completado una sola vez por período ------------------
-- Revisado en la base el 2026-09-24: checklist_runs YA tiene la
-- restricción UNIQUE (checklist_id, fecha) y no hay duplicados, así que
-- no hace falta hacer nada acá.
