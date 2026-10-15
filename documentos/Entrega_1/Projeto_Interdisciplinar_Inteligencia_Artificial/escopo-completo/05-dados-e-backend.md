# Dados, Supabase e Banco

## Cliente Supabase no app

O arquivo `utils/supabase.ts` cria o cliente com duas variaveis de ambiente:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_KEY`

## Comportamentos habilitados

- persistencia de sessao com `AsyncStorage`;
- refresh automatico de token;
- desligamento e religamento do refresh conforme o estado do app.

## O que o app consome de forma real hoje

### Supabase Auth

- login;
- cadastro;
- logout;
- reset de senha;
- OAuth Azure;
- leitura de sessao.

### Tabela `courses`

No cadastro, o app tenta buscar cursos reais pela funcao `listCourses()`.

Se a consulta falhar, usa `fallbackCourses` local para nao quebrar a experiencia.

## O que ainda esta mockado no frontend

- disciplinas;
- notas;
- frequencia;
- pendencias;
- recomendacoes;
- resumo academico.

Esses dados estao em `src/data/mockData.ts`.

## Modelo SQL previsto

Os scripts em `database/` mostram a arquitetura planejada para um backend academico completo.

## Tabelas principais

### Identidade

- `app_users`
- `students`

### Academico

- `subjects`
- `enrollments`
- `assessments`
- `attendance`
- `pending_items`

### Agente

- `agent_runs`
- `agent_recommendations`
- `agent_evidence`
- `agent_feedback`

## Seguranca e RLS

O arquivo `002_rls_policies.sql` aplica Row Level Security para garantir que o estudante autenticado so possa visualizar os proprios dados sensiveis.

### Regra principal

`auth.uid()` e usado como base de comparacao para:

- perfil do usuario;
- estudante;
- matriculas;
- avaliacoes;
- frequencia;
- pendencias;
- execucoes do agente;
- recomendacoes;
- evidencias;
- feedback.

## Trigger de provisionamento automatico

O arquivo `004_auth_profile_trigger.sql` cria automaticamente registros em:

- `app_users`
- `students`

Isso ocorre quando um novo usuario e criado no `auth.users`.

## Hardening de feedback

O arquivo `005_rls_feedback_hardening.sql` reforca a policy de insercao em `agent_feedback`, garantindo que o estudante so consiga enviar feedback para recomendacoes que realmente pertencem a ele.

## Catalogo de cursos

O arquivo `006_create_courses.sql` cria a tabela `courses` e faz seed de cursos da FECAP.

## Divergencia importante entre arquitetura e implementacao atual

Hoje o app:

- usa banco real para autenticacao e cursos;
- nao usa banco real para disciplinas, pendencias, notas ou recomendacoes.

Ou seja, o backend SQL esta mais avancado no desenho do que a integracao efetiva do frontend.

## Beneficio dessa abordagem

Essa separacao permitiu:

- demonstrar produto cedo;
- reduzir dependencia de massa real de dados;
- manter o caminho de evolucao para producao.
