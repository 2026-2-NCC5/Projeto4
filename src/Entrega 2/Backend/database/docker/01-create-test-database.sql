-- Executado pelo PostgreSQL do docker compose apenas na criação do volume.
-- Banco separado para testes de integração/E2E (que recriam o schema a cada execução).
create database asa_conecta_test owner asa;
