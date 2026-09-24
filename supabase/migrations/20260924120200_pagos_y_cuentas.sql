-- Inductoria · Protección de la tabla cuentas (plan, trial y pagos)
-- ---------------------------------------------------------------
-- ANTES DE CORRER ESTO: correr 2026-09-24-diagnostico.sql y revisar el
-- resultado (sobre todo las consultas 2, 3, 4, 5 y 8b). Si la consulta 5
-- muestra triggers sobre cuentas que no conocemos, o la 8b muestra dueños
-- con más de una cuenta, avisanos antes de seguir.
--
-- El problema: hoy el navegador escribe directo en `cuentas` con la
-- sesión del usuario (rol authenticated). Si ese rol tiene INSERT/UPDATE
-- sobre la tabla entera (lo normal en Supabase), cualquier dueño puede
-- abrir la consola del navegador y ponerse plan = 'active', estirarse
-- trial_ends_at o tocar mp_preapproval_id. RLS no alcanza: RLS decide QUÉ
-- FILAS puede tocar (la suya), no QUÉ COLUMNAS.
--
-- Qué escribe el navegador en cuentas hoy (revisado en el código):
--   INSERT  Dashboard.jsx (handleCrearCuenta): owner_id, nombre, plan,
--           trial_ends_at, sucursales_contratadas.
--   UPDATE  Configuracion.jsx (handleToggle): procedimientos_habilitado,
--           checklists_habilitado.
--   UPDATE  Checklists.jsx: checklists_habilitado.
-- Todo lo demás (plan, trial_ends_at después de crear, mp_preapproval_id,
-- acceso_hasta, cancelacion_pendiente, past_due_limite,
-- sucursales_contratadas después de crear) lo escriben solo las Edge
-- Functions con service role, que no se ven afectadas por esto.
--
-- Qué hace este archivo:
--   1. Completa trial_ends_at en trials que lo tienen vacío.
--   2. Saca INSERT/UPDATE/DELETE sobre cuentas a anon y authenticated y
--      devuelve solo las columnas de arriba.
--   3. Trigger BEFORE INSERT: si la cuenta la crea el navegador, se
--      fuerza plan = 'trial', trial_ends_at = ahora + 7 días (TRIAL_DIAS
--      en src/lib/acceso.js), owner_id = el usuario logueado y el resto
--      de los campos de pago vacíos. El navegador sigue mandando plan y
--      trial_ends_at (por eso se deja el permiso de INSERT en esas dos
--      columnas, para no romper Dashboard.jsx), pero lo que mande se
--      ignora.
--
-- Se puede correr más de una vez sin problema.


-- 1) Trials sin fecha de fin ----------------------------------------
-- Mismo cálculo que hace expirar-trials: created_at + 7 días.
update public.cuentas
set trial_ends_at = created_at + interval '7 days'
where plan = 'trial'
  and trial_ends_at is null
  and created_at is not null;


-- 2) Permisos por columna -------------------------------------------
-- Revocar a nivel tabla también revoca los permisos por columna que
-- hubiera, así que después damos solo lo necesario. SELECT no se toca
-- (lo sigue decidiendo RLS).
revoke insert, update, delete, truncate, references, trigger on table public.cuentas from anon;
revoke insert, update, delete, truncate, references, trigger on table public.cuentas from authenticated;

-- Alta de cuenta desde Dashboard.jsx. plan y trial_ends_at van porque el
-- navegador los manda, pero el trigger de abajo los pisa.
grant insert (owner_id, nombre, plan, trial_ends_at, sucursales_contratadas)
  on table public.cuentas to authenticated;

-- Interruptores de secciones (Configuracion.jsx y Checklists.jsx).
grant update (procedimientos_habilitado, checklists_habilitado)
  on table public.cuentas to authenticated;


-- 3) Trigger de alta ---------------------------------------------------
-- SECURITY INVOKER a propósito (el default): con SECURITY DEFINER,
-- current_user pasaría a ser el dueño de la función y nunca valdría
-- 'authenticated'.
create or replace function public.cuentas_forzar_trial_al_crear()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Solo para altas hechas desde el navegador. El SQL Editor (postgres)
  -- y las Edge Functions (service_role) pueden crear cuentas como
  -- quieran, por ejemplo una cuenta de prueba ya activa.
  if current_user in ('authenticated', 'anon') then
    if auth.uid() is null then
      raise exception 'Tenés que iniciar sesión para crear tu cuenta.';
    end if;

    -- Una cuenta por dueño: la app asume eso en todos lados
    -- (.maybeSingle() por owner_id), y además evita que alguien se cree
    -- una cuenta nueva para arrancar otra prueba gratis.
    if exists (select 1 from public.cuentas c where c.owner_id = auth.uid()) then
      raise exception 'Ya tenés una cuenta creada.' using errcode = '23505';
    end if;

    new.owner_id := auth.uid();
    new.plan := 'trial';
    new.trial_ends_at := now() + interval '7 days';
    new.mp_preapproval_id := null;
    new.acceso_hasta := null;
    new.cancelacion_pendiente := false;
    new.past_due_limite := null;
    -- Lo declarado define el precio al suscribirse; al menos 1.
    new.sucursales_contratadas := greatest(1, coalesce(new.sucursales_contratadas, 1));
  end if;
  return new;
end;
$$;

drop trigger if exists cuentas_forzar_trial_al_crear on public.cuentas;
create trigger cuentas_forzar_trial_al_crear
  before insert on public.cuentas
  for each row
  execute function public.cuentas_forzar_trial_al_crear();



-- Para verificar después (solo lectura) ------------------------------
-- Tiene que mostrar INSERT solo en owner_id, nombre, plan,
-- sucursales_contratadas, trial_ends_at y UPDATE solo en
-- checklists_habilitado, procedimientos_habilitado:
--
-- select grantee, privilege_type, string_agg(column_name, ', ' order by column_name)
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'cuentas'
--   and grantee in ('anon', 'authenticated')
--   and privilege_type in ('INSERT', 'UPDATE')
-- group by grantee, privilege_type;
--
-- Para deshacer (vuelve a como estaba antes, con el agujero):
-- grant insert, update, delete on table public.cuentas to authenticated;
-- drop trigger if exists cuentas_forzar_trial_al_crear on public.cuentas;
