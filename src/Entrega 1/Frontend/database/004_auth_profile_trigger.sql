-- ASA Conecta — opcional/recomendado
-- Cria automaticamente app_users + students quando um novo usuário se cadastra
-- pelo Supabase Auth. Execute DEPOIS de 001_init_schema.sql e 002_rls_policies.sql.

create or replace function public.handle_new_asa_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_full_name text;
  v_registration text;
  v_program text;
begin
  v_full_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1), 'Estudante');
  v_registration := coalesce(new.raw_user_meta_data ->> 'registration_number', 'ASA-' || substring(new.id::text, 1, 8));
  v_program := coalesce(new.raw_user_meta_data ->> 'program', 'Ciência da Computação');

  if exists (select 1 from public.students s where s.registration_number = v_registration) then
    v_registration := v_registration || '-' || substring(new.id::text, 1, 4);
  end if;

  insert into public.app_users (id, role, full_name, email)
  values (new.id, 'student', v_full_name, new.email)
  on conflict (id) do nothing;

  insert into public.students (id, registration_number, program)
  values (new.id, v_registration, v_program)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_asa on auth.users;
create trigger on_auth_user_created_asa
  after insert on auth.users
  for each row execute procedure public.handle_new_asa_user();
