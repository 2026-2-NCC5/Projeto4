-- ASA Conecta — Migration 006 — Cursos FECAP
-- Cria o catálogo de cursos usado no cadastro de estudantes.

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  total_semesters integer not null check (total_semesters > 0),
  available_periods text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_courses_updated_at on public.courses;
create trigger trg_courses_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create index if not exists idx_courses_code on public.courses (code);
create index if not exists idx_courses_name on public.courses (name);

alter table public.courses enable row level security;

drop policy if exists courses_select_public on public.courses;
create policy courses_select_public
  on public.courses for select
  to anon, authenticated
  using (true);

insert into public.courses (
  id,
  code,
  name,
  total_semesters,
  created_at,
  updated_at,
  available_periods
) values
  (
    '262a1342-0582-47e4-800d-107e4c4ebaac',
    'PP',
    'Publicidade e Propaganda',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    '37ebff77-b20f-4f2e-9143-5be31d815c50',
    'ADM',
    'Administração',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    '55d57c30-fcca-4b47-9d1c-6569ce25886c',
    'ECON',
    'Ciências Econômicas',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    '586a423f-b3ef-456d-9761-0135e026be32',
    'ADS',
    'Análise e Desenvolvimento de Sistemas',
    4,
    '2026-02-05 14:35:01.138155+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    '688a96a5-1154-4260-a041-b378bbe9afaa',
    'RI',
    'Relações Internacionais',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    '96980ee9-36f7-402d-bc30-94c845c7cc89',
    'RP',
    'Relações Públicas',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    'bc92d675-8de5-402f-b77c-2a2f26d4b5e5',
    'CCOMP',
    'Ciências da Computação',
    8,
    '2026-02-05 14:35:01.138155+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    'd9b7a6b9-f6d1-4ba5-9bc3-8be21c73b482',
    'CONT',
    'Ciências Contábeis',
    8,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  ),
  (
    'f29cd9cc-dacd-465b-b676-1c92dd2d164d',
    'SAE',
    'Secretariado e Assessoria Executiva',
    6,
    '2026-02-09 02:46:15.895284+00',
    '2026-02-11 21:05:37.328455+00',
    array['Matutino', 'Noturno']
  )
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  total_semesters = excluded.total_semesters,
  available_periods = excluded.available_periods,
  updated_at = excluded.updated_at;
