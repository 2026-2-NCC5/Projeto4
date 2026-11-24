-- Reversão manual da migration 018. NÃO roda sozinha; execute em uma transação, depois de um backup.
--
-- PERDA DE DADOS: apaga a lista de perguntas sem resposta do assistente e as páginas lidas do site da FECAP (o cérebro em Backend/cerebro
-- e os artigos da base não são afetados).
--
-- Depois de executar, remova a linha da tabela de controle:
--   delete from schema_migrations where name = '018_assistant_brain.sql';

drop table if exists assistant_site_pages;
drop table if exists assistant_knowledge_gaps;
