# Arquitetura

```mermaid
flowchart LR
  Student[Estudante] --> App[ASA Conecta Expo]
  App -->|sessão ASA| API[Express API]
  App -->|emite token uma vez| Local[Coletor local Python]
  Student -->|login e MFA manuais| Browser[Chromium Scrapling]
  Local --> Browser
  Browser -->|DOM autorizado, somente leitura| Portal[Portal Educacional FECAP]
  Local -->|HTTPS + token pessoal| API
  API --> DB[(PostgreSQL)]
```

O backend Node continua a autoridade de autenticação e resolve o estudante pela sessão existente. O token de sync, aleatório e de alta entropia, é persistido como SHA-256, limitado à conexão de um estudante e revogável. O coletor guarda inventário local separado por sessão, chama apenas a API do ASA e não aceita `student_id` do cliente. Nenhum worker residente é necessário: a navegação longa corre no computador do usuário, não em função Vercel.
