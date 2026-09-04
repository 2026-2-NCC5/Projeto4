# TASK-005 — Classificar Dados e Restrições de Uso

## 1. Definição da TASK-005

A **TASK-005** pertence à **EPIC 16 — Security & LGPD** e tem como objetivo transformar o requisito de
classificação de dados em um **controle técnico verificável**, aplicando os princípios de:

```text
Menor privilégio
Minimização
Defesa em profundidade
```

A entrega deverá ser reproduzível, integrada ao sistema ASA e verificável por outro integrante da
equipe, sem depender de interpretação subjetiva sobre quais dados são sensíveis.

A TASK-005 deverá permanecer consistente com:

```text
TASK-001
Seleção do Agente e Definição da Arquitetura Inicial

TASK-002
Definição do Problema, Objetivo e Indicadores de Sucesso

TASK-003
Mapeamento de Usuários, Perfis e Jornada Principal

TASK-004
Definição do Escopo MVP Comum
```

O agente permanece, em todos os cenários, uma ferramenta de **apoio à decisão**. Nenhuma ação de
impacto relevante (acadêmico, financeiro ou disciplinar) é executada automaticamente — toda ação
desse tipo permanece sujeita à validação humana, conforme já estabelecido nas tasks anteriores.

---

# 2. Escopo do controle técnico

O controle técnico primário avaliado nesta task é o **Row Level Security (RLS)** aplicado no
PostgreSQL, definido em:

```text
database/migrations/002_row_level_security.sql
```

Esse controle existe para dois cenários:

```text
1. Client Supabase usado diretamente com o JWT do estudante (auth.uid())
2. Camada extra de defesa, caso a service role não seja usada
   corretamente em algum ponto do fluxo da API Node.js
```

É importante registrar, de forma explícita, que a **API Node.js normalmente acessa o banco com uma
service role, que ignora RLS**. Isso significa que o RLS **não é o único controle de autorização** do
sistema — ele é uma camada de **defesa em profundidade**. O controle primário de autorização
(estudante não pode consultar dados de outro estudante) deve ser garantido também na camada de
aplicação da API, conforme já exigido pela TASK-004 §34.

---

# 3. Classificação de dados

A tabela abaixo classifica cada entidade persistida pelo ASA, conforme LGPD e conforme o nível de
sensibilidade acadêmica definido nas tasks anteriores.

| Tabela | Classificação | Justificativa | Controle técnico aplicado |
|---|---|---|---|
| `app_users` | Dado pessoal | Identifica o usuário do sistema | RLS `app_users_select_own` |
| `students` | Dado pessoal | Identifica o estudante | RLS `students_select_own` |
| `subjects` | Não sensível | Catálogo institucional, sem PII, não vinculado a um estudante específico | Leitura liberada a `authenticated` |
| `enrollments` | Dado acadêmico | Vincula estudante a disciplina/matrícula | RLS `enrollments_select_own` (`student_id = auth.uid()`) |
| `assessments` | Dado acadêmico sensível | Notas/avaliações — impacto direto na trajetória do estudante | RLS `assessments_select_own` (via `enrollment.student_id`) |
| `attendance` | Dado acadêmico sensível | Frequência — pode gerar consequências acadêmicas | RLS `attendance_select_own` (via `enrollment.student_id`) |
| `pending_items` | Dado acadêmico | Pendências do estudante | RLS `pending_items_select_own` |
| `agent_runs` | Dado derivado sensível | Registra execução de análise sobre o estudante | RLS `agent_runs_select_own` |
| `agent_recommendations` | Dado derivado sensível | Interpretação/recomendação gerada sobre o estudante | RLS `agent_recommendations_select_own` (via `agent_run.student_id`) |
| `agent_evidence` | Dado derivado sensível | Evidência que sustenta uma recomendação sobre o estudante | RLS `agent_evidence_select_own` (via `recommendation → agent_run.student_id`) |
| `agent_feedback` | Dado pessoal | Opinião/feedback fornecido pelo próprio estudante | RLS `agent_feedback_select_own` + `agent_feedback_insert_own` |

**Regra geral aplicada:** todo dado que possa ser rastreado até um `student_id` específico é tratado
como dado pessoal ou acadêmico sensível e recebe policy de `SELECT` restrita a `auth.uid()`, direta ou
via `exists (...)` percorrendo o relacionamento até o estudante dono do dado.

**Escritas (INSERT/UPDATE/DELETE):** nenhuma tabela acadêmica (`enrollments`, `assessments`,
`attendance`, `pending_items`, `agent_runs`, `agent_recommendations`, `agent_evidence`) possui policy
de escrita para o client autenticado. Essas escritas ocorrem exclusivamente via service role (API
Node.js / Agent Service), conforme TASK-002 §11 ("o agente não pode alterar registros acadêmicos") e
TASK-003 §5.5. A única exceção é `agent_feedback`, cujo `insert` é explicitamente liberado ao próprio
estudante (`agent_feedback_insert_own`), pois representa uma ação legítima do usuário sobre seu
próprio dado.

---

# 4. Ameaça e risco mitigado

**Ameaça principal:**

```text
Estudante A consegue ler ou inferir dados acadêmicos/pessoais
pertencentes ao Estudante B.
```

**Vetores considerados:**

```text
1. Client Supabase usado diretamente pelo app mobile com o JWT do
   estudante, manipulando parâmetros de consulta (ex.: student_id
   arbitrário).

2. Falha ou bug na camada de autorização da API Node.js que
   propague um student_id incorreto para a consulta ao PostgreSQL.

3. Uso indevido da service role em um fluxo que deveria estar
   restrito ao próprio usuário.
```

**Risco mitigado pelo RLS:** mesmo que os vetores 1 e 2 ocorram, o banco de dados nega o acesso
cruzado na origem, independentemente de erro na camada de aplicação — desde que a conexão não use
service role.

---

# 5. Comportamento de falha segura

O controle foi desenhado para falhar de forma segura em ambos os sentidos:

```text
Leitura (SELECT) sem match em auth.uid()
        ↓
Retorna 0 linhas
        ↓
Nunca lança erro com detalhe interno,
nunca retorna dado de outro estudante.
```

```text
Escrita (INSERT/UPDATE/DELETE) em tabela acadêmica via client autenticado
        ↓
Nenhuma policy de escrita definida
        ↓
Operação negada por padrão
(RLS nega tudo que não tem policy explícita)
```

Esse comportamento é o oposto de um "fail open": a ausência de uma policy nunca resulta em acesso
liberado — resulta em acesso negado. Isso é uma propriedade nativa do RLS do PostgreSQL (com RLS
habilitado, toda operação sem policy correspondente é negada por padrão) e deve ser citada como parte
do controle, não apenas assumida.

---

# 6. Risco residual

O uso de service role pela API Node.js é uma decisão arquitetural válida (TASK-001 §2) e necessária
para que a API acesse dados de múltiplos estudantes ao processar requisições. Isso implica um risco
residual explícito:

```text
RLS não protege chamadas feitas com service role.
```

**Mitigação complementar (fora do escopo desta migration, mas registrada como dependência):**

* a autorização real, no caminho mais usado pelo app (API Node.js com service role), depende da
  validação feita na camada de aplicação — o `student_id` usado nas queries deve ser derivado da
  sessão/token do usuário autenticado, nunca aceito como parâmetro livre vindo do client
  (TASK-004 §33).
* recomenda-se um teste de autorização na própria API (não apenas no banco) para cobrir esse
  caminho, já que é o caminho efetivamente usado em produção.

Esse risco residual é aceito nesta task com a condição de que o teste de autorização da API (seção 7b)
seja executado como parte da evidência.

---

# 7. Teste negativo reproduzível

## 7.a. Teste de RLS no PostgreSQL (client direto, sem service role)

Arquivo: `tests/security/rls_cross_student_access.sql`

```sql
-- tests/security/rls_cross_student_access.sql
--
-- Objetivo: comprovar que, com RLS habilitado e autenticado como
-- Estudante A, não é possível ler dados pertencentes ao Estudante B.
--
-- Dados utilizados: fictícios/sintéticos (student-demo-A, student-demo-B).
-- Nenhum dado real de estudante é utilizado neste teste.

begin;

-- Simula sessão autenticada do Estudante A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

-- Tenta ler matrícula de outro estudante (Estudante B)
select id, student_id
from enrollments
where student_id = '00000000-0000-0000-0000-00000000000b';
-- Resultado esperado: 0 linhas

-- Tenta ler o próprio registro de outro estudante
select id
from students
where id = '00000000-0000-0000-0000-00000000000b';
-- Resultado esperado: 0 linhas

-- Tenta ler avaliações de outro estudante via enrollment
select a.id
from assessments a
join enrollments e on e.id = a.enrollment_id
where e.student_id = '00000000-0000-0000-0000-00000000000b';
-- Resultado esperado: 0 linhas

-- Controle positivo: o próprio Estudante A consegue ler seus dados
select id, student_id
from enrollments
where student_id = '00000000-0000-0000-0000-00000000000a';
-- Resultado esperado: >= 0 linhas (depende do fixture, mas não deve falhar)

-- Tenta inserir feedback em nome de outro estudante
insert into agent_feedback (recommendation_id, student_id, feedback_type)
values (
  '00000000-0000-0000-0000-00000000000f',
  '00000000-0000-0000-0000-00000000000b',
  'useful'
);
-- Resultado esperado: erro de RLS (new row violates row-level security policy)

rollback;
```

**Como executar:**

```bash
psql "$DATABASE_URL" -f tests/security/rls_cross_student_access.sql
```

**Evidência a capturar:** saída do `psql` mostrando `0 rows` nas três primeiras consultas e o erro de
violação de RLS na tentativa de `insert`. A saída não deve conter nenhum dado real — apenas os UUIDs
fictícios definidos no próprio script.

---

## 7.b. Teste de autorização na API (caminho de service role)

Como a API Node.js normalmente opera com service role — e portanto não é protegida pelo RLS — este
teste cobre o caminho que efetivamente protege o estudante em produção.

Arquivo conceitual: `services/api/tests/security/cross-student-access.test.ts`

```ts
// services/api/tests/security/cross-student-access.test.ts
//
// Objetivo: comprovar que a API rejeita uma tentativa de acesso
// a dados de outro estudante, mesmo operando com service role
// no banco de dados.

describe("Autorização — acesso cruzado entre estudantes", () => {
  it("nega acesso às pendências de outro estudante", async () => {
    const tokenEstudanteA = await getFixtureToken("student-demo-A");

    const response = await request(app)
      .get("/api/student/pending-items")
      .set("Authorization", `Bearer ${tokenEstudanteA}`)
      .query({ student_id: "student-demo-B" }); // tentativa de override

    expect(response.status).toBe(403);
    expect(response.body).not.toHaveProperty("data");
  });

  it("ignora student_id manipulado e usa apenas o do token", async () => {
    const tokenEstudanteA = await getFixtureToken("student-demo-A");

    const response = await request(app)
      .get("/api/student/summary")
      .set("Authorization", `Bearer ${tokenEstudanteA}`)
      .query({ student_id: "student-demo-B" });

    expect(response.status).not.toBe(200);
    // A API nunca deve responder 200 com dados de outro estudante,
    // mesmo que o parâmetro tenha sido manipulado no client.
  });
});
```

**Como executar:**

```bash
npm run test:security
```

**Evidência a capturar:** saída do test runner mostrando os dois casos passando (`403` /
resposta rejeitada), sem nenhum dado pessoal real nos fixtures — apenas `student-demo-A` /
`student-demo-B`.

---

# 8. Classificação dos resultados do teste

| Cenário testado | Camada | Resultado esperado | Resultado obtido |
|---|---|---|---|
| Leitura cruzada via client autenticado (RLS) | PostgreSQL | 0 linhas | *(preencher na execução)* |
| Escrita cruzada via client autenticado (RLS) | PostgreSQL | Erro de policy | *(preencher na execução)* |
| Leitura cruzada via API com `student_id` manipulado | API Node.js | `403 Forbidden` | *(preencher na execução)* |
| Leitura legítima do próprio estudante | PostgreSQL + API | Sucesso | *(preencher na execução)* |

Esta tabela deverá ser preenchida com o resultado real da execução e anexada como evidência do PR —
não deve ser publicada com dados de execução fictícios apresentados como se fossem reais.

---

# 9. Achados, correções e risco residual final

Estrutura sugerida para o registro final (a preencher durante a execução da task):

```text
Achado 1
Descrição: <o que foi encontrado>
Severidade: <baixa/média/alta>
Correção aplicada: <o que foi feito>
Status: <corrigido / aceito como risco residual>
```

```text
Achado 2
...
```

Se nenhum achado crítico for identificado, isso também deve ser registrado explicitamente:

```text
Nenhum achado de severidade média ou alta identificado nesta rodada.
Risco residual aceito: dependência da autorização de aplicação
para requisições feitas com service role (ver Seção 6).
```

---

# 10. Evidências esperadas

```text
Documento
docs/security/TASK-005-data-classification-and-usage-restrictions.md

Migration de referência
database/migrations/002_row_level_security.sql

Teste de RLS
tests/security/rls_cross_student_access.sql

Teste de autorização da API
services/api/tests/security/cross-student-access.test.ts

Saída dos testes (capturas ou logs, sem dados reais)
docs/evidence/TASK-005/

Commit
+
Pull Request
+
Revisão cruzada
```

Nenhuma evidência deverá conter:

```text
tokens
senhas
chaves de API
credenciais de banco
dados pessoais reais
dados acadêmicos reais
```

Apenas identificadores fictícios (ex.: `student-demo-A`, `student-demo-B`) devem aparecer em
qualquer evidência versionada.

---

# 11. Critérios de aceite da TASK-005

* [ ] Toda tabela com dado pessoal ou acadêmico está classificada na tabela da Seção 3.
* [ ] Cada classificação está associada a um controle técnico verificável (RLS).
* [ ] A ameaça e o risco mitigado estão documentados (Seção 4).
* [ ] O comportamento de falha segura está documentado e é consistente com o comportamento real do RLS (Seção 5).
* [ ] O risco residual do uso de service role está documentado explicitamente (Seção 6).
* [ ] Existe teste negativo reproduzível no nível do banco de dados (Seção 7.a).
* [ ] Existe teste negativo reproduzível no nível da API, cobrindo o caminho de service role (Seção 7.b).
* [ ] Os testes utilizam exclusivamente dados fictícios/sintéticos.
* [ ] Menor privilégio é demonstrado (nenhuma policy de escrita concedida além do necessário).
* [ ] Comportamento de falha segura é demonstrado na prática (saída real do teste, não apenas descrito).
* [ ] Nenhum token, senha, chave ou dado pessoal real está presente em código, log ou evidência.
* [ ] Achados, correções e risco residual estão registrados (Seção 9), mesmo que o resultado seja "nenhum achado".
* [ ] Nenhuma decisão administrativa automática é habilitada por este controle — ele é estritamente de leitura/escrita de dados.
* [ ] A revisão cruzada foi realizada por **Yamaschita**.
* [ ] A versão aprovada foi registrada no Git.

---

# 12. Revisão cruzada

Conforme os metadados da task, o reviewer responsável será:

```text
Yamaschita
```

A revisão deverá verificar principalmente:

* se a classificação de dados cobre todas as tabelas relevantes;
* se cada classificação está de fato amparada por um controle técnico existente (não apenas
  descrito em texto);
* se o teste negativo é reproduzível por outro integrante, sem ajustes manuais além dos UUIDs de
  fixture;
* se o comportamento de falha segura foi demonstrado com saída real, não apenas assumido;
* se o risco residual do uso de service role está claramente registrado;
* ausência de dados pessoais reais;
* ausência de secrets.

---

# 13. Registro da revisão

Durante o Pull Request:

```text
Task: TASK-005
Epic: EPIC 16 — Security & LGPD
Reviewer: Yamaschita
Status: Em revisão
```

Após aprovação:

```text
Task: TASK-005
Epic: EPIC 16 — Security & LGPD
Reviewer: Yamaschita
Status: Aprovado
Data: YYYY-MM-DD
PR: #XX
Commit: <SHA>
```

---

# 14. Resultado da TASK-005

Com esta definição, o ASA passa a possuir um controle de classificação de dados verificável e
reproduzível:

```text
Dado
   ↓
Classificação (pessoal / acadêmico / não sensível)
   ↓
Controle técnico (RLS + autorização de aplicação)
   ↓
Teste negativo reproduzível
   ↓
Falha segura demonstrada
   ↓
Risco residual documentado
```

O controle primário testado nesta task — Row Level Security sobre as tabelas que carregam
`student_id` — comprova, em conjunto com a autorização da camada de aplicação, que:

```text
Um estudante não consegue, por nenhum caminho testado,
ler ou escrever dados pertencentes a outro estudante.
```

Isso atende diretamente à regra já estabelecida em TASK-003 §5.5 e TASK-004 §91: *"o estudante deverá
visualizar somente seus próprios dados"* e *"o usuário não pode selecionar arbitrariamente dados de
outro estudante"* — agora com evidência técnica reproduzível, e não apenas como requisito descrito.
