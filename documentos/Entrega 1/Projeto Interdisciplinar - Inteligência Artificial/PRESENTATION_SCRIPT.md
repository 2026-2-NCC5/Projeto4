# Roteiro rápido de apresentação — ASA Conecta

## 1. Problema
O estudante possui dados acadêmicos, mas nem sempre consegue transformar esses dados em prioridade e próxima ação.

## 2. Solução
O ASA Conecta organiza o panorama acadêmico e usa o Agente para o Estudante para gerar recomendações explicáveis.

## 3. Demonstração
- Login/cadastro real via Supabase Auth.
- Home com panorama acadêmico.
- Acadêmico com dados fictícios: notas, frequência e pendências.
- Assistente com perguntas em linguagem natural.
- Recomendação sempre acompanhada de evidência e próxima ação.
- Pedido de alteração de nota é recusado e encaminhado para validação humana.

## 4. Segurança
- O agente apoia decisões; não toma decisões administrativas.
- Dados acadêmicos de demo são fictícios.
- Sessão é autenticada no Supabase.

## 5. Fechamento
O protótipo demonstra o fluxo principal do MVP: estudante → app → análise → recomendação → evidências → próxima ação.
