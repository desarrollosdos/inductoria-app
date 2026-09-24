-- Inductoria · 2026-09-24 · Tabla de intentos de evaluación
-- ---------------------------------------------------------
-- El código ya guarda cada intento de evaluación (apruebe o no) y la
-- pantalla Progreso muestra cuántas veces reprobó cada empleado, pero la
-- tabla nunca se creó en la base: hoy el guardado falla en silencio y
-- Progreso muestra siempre 0. Esto la crea.
-- Se puede correr más de una vez sin problema.

create table if not exists public.intentos_evaluacion (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id) on delete cascade,
  microcurso_id uuid not null references public.microcursos(id) on delete cascade,
  puntaje numeric,
  correctas integer,
  total integer,
  aprobado boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists intentos_evaluacion_empleado_idx
  on public.intentos_evaluacion (empleado_id, aprobado);

alter table public.intentos_evaluacion enable row level security;

-- Las filas las escribe solo la Edge Function (service role). El dueño
-- solo puede leer las de sus empleados.
revoke insert, update, delete, truncate on table public.intentos_evaluacion from anon, authenticated;

drop policy if exists "Dueño ve los intentos de sus empleados" on public.intentos_evaluacion;
create policy "Dueño ve los intentos de sus empleados"
  on public.intentos_evaluacion
  for select
  to authenticated
  using (
    empleado_id in (
      select e.id
      from public.empleados e
      join public.negocios n on n.id = e.negocio_id
      join public.cuentas c on c.id = n.cuenta_id
      where c.owner_id = auth.uid()
    )
  );
