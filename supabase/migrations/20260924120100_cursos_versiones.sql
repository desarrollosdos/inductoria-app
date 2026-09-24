-- Inductoria · 2026-09-24 · Versiones de cursos y reemplazo atómico de pasos
-- ---------------------------------------------------------------------------
-- CORRER ESTE ARCHIVO ENTERO EN EL SQL EDITOR DE SUPABASE ANTES DE DESPLEGAR
-- las funciones actualizar-curso-ia y procesar-contenido y el frontend nuevo.
-- Es idempotente: se puede correr más de una vez sin romper nada.
--
-- Contrato de versiones (lo usa también el lado del empleado):
--   * microcursos.version es un entero que arranca en 1.
--   * progreso_empleado tiene una fila por versión del curso; la versión
--     "actual" de un curso es siempre microcursos.version.
--   * La versión sube en 1, y solo en 1, en el momento en que un curso que
--     estaba en revisión (estado 'en_revision', o sea que ya había estado
--     publicado antes) se vuelve a publicar (estado 'aprobado') Y durante
--     esa revisión la IA le cambió el contenido (revision_con_cambios).
--   * Las actualizaciones con IA que se hagan dentro de la misma revisión
--     no suben la versión: solo marcan revision_con_cambios = true.
--   * Si el dueño vuelve a publicar sin haber cambiado nada, la versión
--     queda igual (los empleados no tienen que rehacer un curso idéntico).
--   * Nadie más puede cambiar version a mano: el trigger la pisa con el
--     valor anterior en cualquier otro UPDATE. Así el frontend, una
--     función vieja o un error no pueden desincronizarla.

-- 1) Columnas ------------------------------------------------------------

alter table public.microcursos
  add column if not exists version integer not null default 1;

update public.microcursos set version = 1 where version is null or version < 1;

-- true cuando, durante la revisión actual, la IA ya regeneró el contenido.
alter table public.microcursos
  add column if not exists revision_con_cambios boolean not null default false;

-- Momento en que arrancó la generación con IA de un contenido. Sirve para
-- detectar generaciones que quedaron trabadas en 'generando' (el proceso
-- en segundo plano se cortó) y ofrecer reintentar o eliminar.
alter table public.contenidos
  add column if not exists generando_desde timestamptz;

-- 2) Trigger de versión --------------------------------------------------

create or replace function public.microcursos_controlar_version()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    if new.version < 1 then new.version := 1; end if;
    new.revision_con_cambios := false;
    return new;
  end if;

  -- UPDATE: la versión solo la decide este trigger.
  new.version := coalesce(old.version, 1);

  if old.estado = 'en_revision' and new.estado = 'aprobado' then
    if coalesce(old.revision_con_cambios, false) or coalesce(new.revision_con_cambios, false) then
      new.version := coalesce(old.version, 1) + 1;
      -- Para el aviso de "contenido actualizado" del empleado.
      new.actualizado_at := now();
    end if;
    new.revision_con_cambios := false;
  end if;

  return new;
end;
$$;

drop trigger if exists microcursos_controlar_version on public.microcursos;
create trigger microcursos_controlar_version
  before insert or update on public.microcursos
  for each row execute function public.microcursos_controlar_version();

-- 3) Reemplazo atómico del contenido de un curso -------------------------
-- Lo usa actualizar-curso-ia (con la service role, después de validar que
-- el curso es del usuario que llama). Todo pasa en una sola transacción:
-- si algo falla, el curso queda exactamente como estaba, nunca sin pasos.

create or replace function public.reemplazar_contenido_curso(
  p_microcurso_id uuid,
  p_titulo text,
  p_duracion_min integer,
  p_preguntas jsonb,
  p_pasos jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_pasos is null or jsonb_typeof(p_pasos) <> 'array' or jsonb_array_length(p_pasos) = 0 then
    raise exception 'pasos vacíos';
  end if;

  update public.microcursos
     set titulo = p_titulo,
         duracion_min = p_duracion_min,
         preguntas = coalesce(p_preguntas, '[]'::jsonb),
         actualizado_at = now(),
         revision_con_cambios = true
   where id = p_microcurso_id;

  if not found then
    raise exception 'curso no encontrado';
  end if;

  delete from public.pasos where microcurso_id = p_microcurso_id;

  insert into public.pasos (microcurso_id, orden, titulo, contenido)
  select p_microcurso_id,
         (e.ord)::int,
         e.paso->>'titulo',
         e.paso->>'contenido'
    from jsonb_array_elements(p_pasos) with ordinality as e(paso, ord);
end;
$$;

-- Solo la service role (Edge Functions) la puede llamar directo.
revoke all on function public.reemplazar_contenido_curso(uuid, text, integer, jsonb, jsonb) from public;
revoke all on function public.reemplazar_contenido_curso(uuid, text, integer, jsonb, jsonb) from anon, authenticated;
grant execute on function public.reemplazar_contenido_curso(uuid, text, integer, jsonb, jsonb) to service_role;
