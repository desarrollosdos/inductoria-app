-- Inductoria · 2026-09-25 · Cambios de precio programados
-- -------------------------------------------------------
-- Mismo mecanismo que Repunte: el precio se cambia desde Admin con una
-- fecha de vigencia. Hasta esa fecha los clientes ven un aviso en la
-- app (y un mail, si está configurado). El día que llega la fecha, la
-- función aplicar-cambio-precio (cron diario) pasa el precio nuevo a
-- configuracion_precio y actualiza el monto de la suscripción en
-- MercadoPago de cada cliente que ya paga, respetando su cantidad de
-- sucursales y los descuentos por volumen de src/lib/precio.js.
-- Se puede correr más de una vez sin problema.

create table if not exists public.precio_cambios (
  id bigint generated always as identity primary key,
  precio_base_nuevo integer not null check (precio_base_nuevo > 0),
  precio_base_anterior integer,
  vigente_desde date not null,
  aviso_dias_antes integer not null default 5,
  aviso_enviado boolean not null default false,
  aplicado_at timestamptz,
  cancelado_at timestamptz,
  creado_por text,
  created_at timestamptz not null default now()
);

alter table public.precio_cambios enable row level security;
revoke all on table public.precio_cambios from anon, authenticated;
grant select on table public.precio_cambios to authenticated;

-- Cualquier dueño logueado puede ver el cambio pendiente (es lo mismo
-- que le muestra el aviso). Solo las Edge Functions escriben.
drop policy if exists "Dueños ven el cambio de precio pendiente" on public.precio_cambios;
create policy "Dueños ven el cambio de precio pendiente"
  on public.precio_cambios
  for select
  to authenticated
  using (aplicado_at is null and cancelado_at is null);

-- Registro por cuenta de a quién ya se le actualizó el monto en
-- MercadoPago. Si a una cuenta le falla, el cron la reintenta al día
-- siguiente sin volver a tocar a las que salieron bien.
create table if not exists public.precio_aplicado_log (
  cuenta_id uuid not null references public.cuentas(id) on delete cascade,
  precio_cambio_id bigint not null references public.precio_cambios(id) on delete cascade,
  ok boolean not null default false,
  monto integer,
  error text,
  intentado_at timestamptz not null default now(),
  primary key (cuenta_id, precio_cambio_id)
);

alter table public.precio_aplicado_log enable row level security;
revoke all on table public.precio_aplicado_log from anon, authenticated;

-- Cron diario (3:15 de la mañana, hora Argentina). Se arma copiando el
-- cron de expirar-trials, que ya tiene la clave CRON_SECRET, y cambiando
-- solo la dirección de la función.
do $$
declare
  comando text;
begin
  select replace(command, '/functions/v1/expirar-trials', '/functions/v1/aplicar-cambio-precio')
    into comando
    from cron.job
   where jobname = 'inductoria-expirar-trials';

  if comando is null or comando not like '%aplicar-cambio-precio%' then
    raise exception 'No encontré el cron inductoria-expirar-trials para copiarlo. Avisale a Claude.';
  end if;

  perform cron.schedule('inductoria-cambio-precio', '15 6 * * *', comando);
end
$$;
