-- Private, append-only per-photo decisions. No existing stories or photos are approved.
begin;
create table public.editorial_photo_permissions (
  id bigint generated always as identity primary key,
  asset_key text not null check (asset_key ~ '^[0-9a-f]{64}$'),
  approved boolean not null,
  credit text not null check (length(credit) between 1 and 90),
  evidence text not null check (length(evidence) between 8 and 500),
  reviewer uuid not null,
  decided_at timestamptz not null default now()
);
create index editorial_photo_permission_latest on public.editorial_photo_permissions(asset_key, id desc);
alter table public.editorial_photo_permissions enable row level security;
revoke all on public.editorial_photo_permissions from public, anon, authenticated, service_role;
grant select,insert on public.editorial_photo_permissions to service_role;
grant usage on sequence public.editorial_photo_permissions_id_seq to service_role;
commit;
