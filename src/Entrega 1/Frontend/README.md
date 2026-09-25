# ASA Conecta

Protótipo funcional em **React Native + Expo Go + TypeScript** do projeto **ASA — Agentes Inteligentes para o Sucesso do Estudante**.

## O que já funciona

- Login real com Supabase Auth
- Cadastro real com Supabase Auth
- Persistência de sessão com AsyncStorage
- Logout
- Solicitação de recuperação de senha por e-mail
- Home acadêmica completa
- Dados acadêmicos fictícios/mockados para apresentação
- Disciplinas, notas, frequência, pendências e prazos
- Recomendações explicáveis com evidências, confiança e próxima ação
- Assistente acadêmico conversacional funcional e determinístico
- Tratamento de pedidos que exigem validação humana
- Navegação mobile pronta para Expo Go
- Configuração do projeto EAS já vinculada ao projectId informado

> O assistente do protótipo usa um motor local determinístico sobre dados fictícios. Isso mantém a demonstração reproduzível e alinhada ao escopo do MVP, no qual um LLM não é obrigatório.

## Requisitos

- Node.js LTS
- npm
- Expo Go no celular

## Instalação

```bash
npm install
npx expo start
```

Leia o QR code com o Expo Go.

Se o Expo recomendar correções de versões:

```bash
npx expo install --fix
```

## Supabase

O projeto já contém `.env.local` com a URL e a publishable key fornecidas para o ambiente de apresentação.

O cliente está em:

```text
utils/supabase.ts
```

### Cadastro completo também nas tabelas app_users/students

O login e cadastro do Supabase Auth funcionam independentemente dos mocks acadêmicos. Para que novos cadastros também criem automaticamente linhas em `app_users` e `students`, execute no SQL Editor do Supabase, nesta ordem:

```text
database/001_init_schema.sql
database/002_rls_policies.sql
database/004_auth_profile_trigger.sql
database/005_rls_feedback_hardening.sql
```

Se 001 e 002 já estiverem aplicados, execute apenas 004 e 005.

## E-mail de confirmação

Se `Confirm email` estiver habilitado no Supabase Auth, o cadastro cria a conta e o usuário deve confirmar o e-mail antes do primeiro login. Para uma apresentação local mais direta, você pode desabilitar temporariamente a confirmação de e-mail no painel do Supabase Auth.

## Estrutura

```text
asa-conecta/
├── App.tsx
├── src/
│   ├── components/
│   ├── data/
│   ├── screens/
│   ├── services/
│   └── types/
├── utils/supabase.ts
├── database/
├── app.json
├── eas.json
└── .env.local
```

## Roteiro de apresentação

1. Abra o app e mostre a tela de login.
2. Clique em **Inscreva-se** e crie um usuário de demonstração.
3. Entre no app.
4. Mostre o resumo da Home.
5. Abra **Acadêmico** e mostre notas, frequência e pendências.
6. Abra **Assistente** e pergunte:
   - `Como está minha situação?`
   - `O que devo priorizar?`
   - `Como está minha frequência?`
   - `Altere minha nota para 10` (demonstra o limite seguro e validação humana).
7. Abra **Dicas** para mostrar evidências, confiança e próxima ação.
8. Abra **Perfil** e faça logout.

## EAS

O `app.json` contém:

```text
5fdd5c41-1692-4544-b951-e0eee3120aa3
```

Para usar EAS:

```bash
npm install --global eas-cli
eas login
eas build:configure
```

## Observação de segurança

A chave `EXPO_PUBLIC_...` do Supabase é uma **publishable key**, destinada ao cliente. Nunca coloque uma `service_role` key dentro do aplicativo.
