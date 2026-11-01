# Banco de dados

Migration `013_internships.sql` adiciona `internships`, `internship_documents`, `internship_events` e `internship_appeals`. O processo pertence ao `students.id` resolvido no backend. Campos de cadastro são guardados em JSONB para manter o snapshot sem perda durante a evolução inicial do formulário; documentos guardam snapshot, campos renderizados, versão de template e SHA-256. Eventos são append-only por trigger. Aplicação: `npm run db:migrate` na API.

Limites atuais: os binários dos documentos não são armazenados; hoje há prévia textual e não PDF. Não há object storage nem política automática de retenção/anonimização ainda.
