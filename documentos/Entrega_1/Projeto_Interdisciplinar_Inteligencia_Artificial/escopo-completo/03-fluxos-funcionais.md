# Fluxos Funcionais do Sistema

## 1. Inicializacao do app

Ao abrir o app:

1. `App.tsx` consulta a sessao atual com `supabase.auth.getSession()`.
2. Enquanto a sessao esta sendo carregada, o usuario ve uma splash interna.
3. Se existir usuario autenticado, o app abre no fluxo principal.
4. Se nao existir sessao, o app abre a tela de autenticacao.

## 2. Fluxo de login

### Entrada por e-mail e senha

1. O usuario informa e-mail institucional e senha.
2. O frontend valida se o dominio e `@edu.fecap.br` ou `@fecap.br`.
3. A senha precisa ter ao menos 6 caracteres.
4. O service `signIn()` chama `supabase.auth.signInWithPassword`.
5. Em caso de sucesso, o listener de auth atualiza o estado global do app.

### Regras importantes

- O e-mail e normalizado para minusculo.
- Credenciais invalidas recebem mensagem amigavel.
- O fluxo e bloqueado para e-mails fora do padrao institucional.

## 3. Fluxo de login com Microsoft

1. O usuario aciona o botao Microsoft FECAP.
2. O app chama `supabase.auth.signInWithOAuth` com provider `azure`.
3. O fluxo depende da configuracao do provider no Supabase.

## 4. Fluxo de cadastro

1. O usuario muda para o modo `Cadastro`.
2. Preenche nome completo, RA, curso, e-mail e senha.
3. O frontend valida:
   - e-mail institucional;
   - RA com exatamente 8 digitos;
   - senha minima de 6 caracteres;
   - confirmacao de senha igual.
4. O service `signUp()` envia metadados ao Supabase Auth:
   - `full_name`
   - `registration_number`
   - `program`
   - `role`
5. Se o Supabase nao retornar sessao imediata, o app informa necessidade de confirmacao por e-mail.

## 5. Fluxo de recuperacao de senha

1. O usuario acessa o modo `Senha` ou toca em `Esqueci minha senha`.
2. O frontend exige e-mail institucional valido.
3. O app chama `resetPasswordForEmail`.
4. A interface exibe mensagem neutra para nao revelar se a conta existe.

## 6. Fluxo autenticado

Quando a sessao esta ativa, o usuario pode navegar entre cinco abas:

- `Início`
- `Acadêmico`
- `Assistente`
- `Dicas`
- `Perfil`

O estado `activeTab` controla qual tela esta visivel.

## 7. Fluxo da Home

A Home agrega os principais sinais do sistema:

- saudacao personalizada;
- panorama academico;
- cards com indicadores;
- prioridade do dia;
- prazos proximos;
- progresso geral do semestre.

Ela funciona como painel executivo do estudante.

## 8. Fluxo academico

A tela `Acadêmico` possui dois modos:

- `Disciplinas`
- `Pendências`

### Disciplinas

Mostra para cada materia:

- codigo;
- nome;
- professor;
- nota;
- frequencia;
- progresso;
- status visual.

### Pendencias

Mostra:

- prioridade;
- descricao;
- disciplina relacionada;
- prazo.

## 9. Fluxo do assistente

1. A tela inicia com uma mensagem de boas-vindas personalizada.
2. O usuario pode usar prompts rapidos ou digitar perguntas.
3. A pergunta entra no motor `answerAcademicQuestion()`.
4. O motor avalia padroes textuais e devolve uma resposta estruturada.
5. A resposta pode conter:
   - texto principal;
   - evidencias;
   - proxima acao;
   - alerta de validacao humana.

## 10. Fluxo das recomendacoes

1. O usuario abre a aba `Dicas`.
2. O app lista recomendacoes vindas do mock local.
3. Cada item mostra:
   - tom da recomendacao;
   - confianca;
   - mensagem;
   - evidencias;
   - proxima acao.
4. O usuario pode expandir ou recolher os detalhes.

## 11. Fluxo de logout

1. O usuario acessa `Perfil`.
2. Clica em `Sair da conta`.
3. O app executa `supabase.auth.signOut()`.
4. O listener de auth limpa a sessao e volta para a autenticacao.

## 12. Fluxos negados pelo sistema

O sistema propositalmente se recusa a:

- alterar nota;
- alterar frequencia;
- alterar matricula;
- confirmar divergencia administrativa sem pessoa responsavel.

Esses bloqueios fazem parte do comportamento esperado do MVP.
