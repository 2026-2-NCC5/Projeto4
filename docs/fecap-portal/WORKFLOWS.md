# Fluxo operacional

```mermaid
sequenceDiagram
  actor E as Estudante
  participant A as ASA Conecta
  participant C as Coletor local
  participant P as Portal FECAP
  participant DB as PostgreSQL ASA
  E->>A: Criar conexão pessoal
  A-->>E: Mostrar token uma vez
  E->>C: Configurar token local e iniciar login
  C->>P: Abrir interface oficial no Chromium
  E->>P: Concluir senha/MFA/CAPTCHA manual
  C->>P: Navegar e coletar páginas consultivas
  C->>C: Validar, normalizar e gravar checkpoint privado
  opt Sincronização habilitada explicitamente
    C->>A: POST inventário com token pessoal
    A->>DB: Validar escopo, persistir sessão/rotas/auditoria
    A-->>C: ID e estado interno ASA
  end
  E->>A: Revogar conexão quando desejar
```

Em falha, a sessão local permanece em checkpoint incompleto; o comando `scan --resume` tenta retomar rotas ainda não visitadas após reautenticação. A sincronização deve ser repetida manualmente; não há agenda automática nesta versão.
