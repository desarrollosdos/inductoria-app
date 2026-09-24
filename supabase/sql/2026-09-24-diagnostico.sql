-- Inductoria · Diagnóstico de seguridad (SOLO LECTURA)
-- ---------------------------------------------------------------
-- Correr esto ANTES de 2026-09-24-pagos-y-cuentas.sql, en el SQL Editor
-- de Supabase, y revisar (o mandarnos) el resultado de cada consulta.
-- No modifica nada: son todas consultas SELECT. Se puede correr las
-- veces que haga falta. Conviene correr cada bloque por separado para
-- ver cada resultado (el SQL Editor muestra solo el último si se corre
-- todo junto).
--
-- Qué buscar:
--   1. Toda tabla con datos de clientes tiene que tener RLS activada
--      (rls_activada = true).
--   2. Las políticas de cuentas tienen que limitar todo a
--      owner_id = auth.uid(). Una política "using (true)" para
--      authenticated o anon es un agujero.
--   3/4. Hoy seguramente authenticated tiene INSERT/UPDATE sobre TODA la
--      tabla cuentas: eso le permite a cualquier dueño ponerse
--      plan = 'active' desde la consola del navegador. Es lo que arregla
--      2026-09-24-pagos-y-cuentas.sql.
--   5. Triggers que ya existan sobre cuentas (para no pisar ninguno).
--   7. Que exista el cron diario de expirar-trials.
--   8. Filas raras: dueños con más de una cuenta, trials sin fecha.


-- 1) RLS activada por tabla (esquema public) -------------------------
select
  c.relname                as tabla,
  c.relrowsecurity         as rls_activada,
  c.relforcerowsecurity    as rls_forzada
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
order by c.relrowsecurity, c.relname;


-- 2) Políticas de RLS de las tablas con datos de clientes ------------
select
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual        as condicion_using,
  with_check  as condicion_with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'cuentas', 'negocios', 'empleados', 'microcursos', 'contenidos',
    'progreso_empleado', 'intentos_evaluacion', 'procedimientos', 'pasos',
    'checklists', 'checklist_items', 'checklist_runs', 'cursos_base',
    'configuracion_precio', 'administradores', 'preguntas_ia',
    'ai_usage_log', 'audio_transcripciones_log', 'landing_visitas'
  )
order by tablename, cmd, policyname;

-- 2b) Todas las políticas del esquema public (por si hay tablas que no
-- están en la lista de arriba).
select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- 3) Permisos a nivel tabla para anon / authenticated -----------------
select table_name as tabla, grantee as rol, string_agg(privilege_type, ', ' order by privilege_type) as permisos
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
group by table_name, grantee
order by table_name, grantee;


-- 4) Permisos por columna sobre cuentas (INSERT / UPDATE) -------------
-- Si authenticated tiene UPDATE a nivel tabla (consulta 3), acá aparecen
-- todas las columnas: incluye plan, trial_ends_at, mp_preapproval_id...
select grantee as rol, privilege_type as permiso, string_agg(column_name, ', ' order by column_name) as columnas
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'cuentas'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE')
group by grantee, privilege_type
order by grantee, privilege_type;

-- 4b) Columnas reales de cuentas (para confirmar nombres y defaults).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'cuentas'
order by ordinal_position;

-- 4c) Restricciones de cuentas (¿hay unique en owner_id?).
select conname, contype, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.cuentas'::regclass
order by conname;


-- 5) Triggers sobre cuentas (con el código de su función) ------------
select
  t.tgname                          as trigger,
  t.tgenabled                       as habilitado,
  pg_get_triggerdef(t.oid)          as definicion,
  p.proname                         as funcion,
  pg_get_functiondef(p.oid)         as codigo_funcion
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.cuentas'::regclass
  and not t.tgisinternal
order by t.tgname;


-- 6) Función es_administrador (la usan App.jsx y ahora las funciones
-- de Admin): confirmar que exista y cómo decide.
select p.proname, pg_get_functiondef(p.oid) as codigo, p.prosecdef as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'es_administrador';


-- 7) Cron jobs (pg_cron) ----------------------------------------------
-- Si da error "schema cron does not exist", pg_cron no está instalado y
-- expirar-trials no corre sola: avisanos.
select jobid, jobname, schedule, active, command
from cron.job
order by jobid;

-- 7b) Últimas 20 corridas de los cron jobs.
select jobid, status, start_time, end_time, left(return_message, 200) as mensaje
from cron.job_run_details
order by start_time desc
limit 20;


-- 8) Datos para revisar antes de aplicar el SQL de pagos --------------
-- 8a) Cuentas por plan.
select plan, count(*) as cantidad
from public.cuentas
group by plan
order by plan;

-- 8b) Dueños con más de una cuenta (la app asume una sola por dueño; el
-- trigger nuevo no deja crear una segunda desde el navegador).
select owner_id, count(*) as cuentas
from public.cuentas
group by owner_id
having count(*) > 1;

-- 8c) Trials sin fecha de fin (nunca vencían).
select id, nombre, created_at
from public.cuentas
where plan = 'trial' and trial_ends_at is null;

-- 8d) Cuentas activas sin suscripción de MercadoPago guardada (pueden
-- ser cuentas exentas o activadas a mano; si no, revisar).
select id, nombre, plan, created_at
from public.cuentas
where plan in ('active', 'past_due') and mp_preapproval_id is null;
