-- ============================================================
-- Inductoria · Cuenta de demostración de solo lectura (2026-09-27)
-- ============================================================
-- Mail: demo@inductoria.com.ar. Quien lo escribe en la pantalla de
-- entrada entra directo, sin link ni contraseña (Edge Function
-- demo-login). Es una sola cuenta compartida.
--
-- Se usa en DOS pasos:
--   PASO A (este archivo, todo): crea la tabla, el bloqueo y deja la demo
--          habilitada pero TODAVÍA EDITABLE, para cargar los datos de
--          ejemplo (sucursal, empleados, cursos de la biblioteca, etc).
--   PASO B (al final, está comentado): la pasa a SOLO LECTURA y le
--          estira la prueba gratis. Se corre cuando los datos de ejemplo
--          ya están cargados.
-- Se puede correr más de una vez sin problema.

-- 1) Lista de cuentas demo (solo la lee el servidor)
create table if not exists public.cuentas_demo (
  email        text primary key check (email = lower(email)),
  solo_lectura boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.cuentas_demo enable row level security;
revoke all on public.cuentas_demo from anon, authenticated;

insert into public.cuentas_demo (email, solo_lectura)
values ('demo@inductoria.com.ar', false)
on conflict (email) do nothing;

-- 2) Bloqueo de escritura: si quien escribe desde el navegador es una
--    cuenta demo en solo lectura, la base rechaza el cambio. Las Edge
--    Functions (service role) y el SQL Editor no se ven afectados.
create or replace function public.bloquear_escritura_demo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' and exists (
    select 1 from public.cuentas_demo d
    where d.solo_lectura
      and d.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  ) then
    raise exception 'Esta es una cuenta de demostración: podés mirar todo, pero no se guardan cambios.'
      using errcode = '42501';
  end if;
  return null;
end;
$$;

-- 3) Se engancha a TODAS las tablas de public (una vez por sentencia).
do $$
declare t record;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'cuentas_demo'
  loop
    execute format('drop trigger if exists zz_bloquear_escritura_demo on public.%I', t.tablename);
    execute format(
      'create trigger zz_bloquear_escritura_demo before insert or update or delete on public.%I
         for each statement execute function public.bloquear_escritura_demo()',
      t.tablename
    );
  end loop;
end;
$$;

-- Verificación: tiene que mostrar la demo con solo_lectura = false.
select * from public.cuentas_demo;


-- ============================================================
-- PASO B · Correr DESPUÉS de cargar los datos de ejemplo
-- (sacarle los dos guiones del principio a cada línea y correr solo esto)
-- ============================================================
-- update public.cuentas_demo set solo_lectura = true where email = 'demo@inductoria.com.ar';
-- update public.cuentas c set trial_ends_at = now() + interval '1 year'
--   from auth.users u
--   where u.id = c.owner_id and lower(u.email) = 'demo@inductoria.com.ar';
-- select u.email, c.nombre, c.plan, c.trial_ends_at, d.solo_lectura
--   from public.cuentas c
--   join auth.users u on u.id = c.owner_id
--   join public.cuentas_demo d on d.email = lower(u.email);

-- Para dar de baja la demo más adelante:
-- delete from public.cuentas_demo where email = 'demo@inductoria.com.ar';
