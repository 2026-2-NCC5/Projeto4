# Segurança e privacidade

As rotas exigem autenticação existente e o vínculo de estudante é resolvido da sessão. Toda consulta e mutação usa `student_id` da sessão; IDs alheios não retornam registros. O serviço não registra CPF nem solicita senha acadêmica. Dados pessoais de estágio são mantidos no PostgreSQL já configurado pelo projeto. Aplicar em ambiente real as políticas de TLS, backup, criptografia e retenção do banco; revisar base legal e prazos com a instituição antes de produção. Sem integração institucional, credenciais externas não são necessárias.
