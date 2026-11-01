# Mapa de navegação observado

**Estado atual: ainda não observado em sessão autenticada.** As credenciais foram configuradas localmente e o portal respondeu, mas a sessão não foi confirmada pelo coletor. Portanto, não há rotas, menus ou seções acadêmicas reais a relatar e nenhuma cobertura do portal é afirmada.

Após uma varredura autorizada, gere mapa local com `fecap-portal export-map --output .private/fecap-navigation-map.json`. O mapa contém somente achados da sessão que o produziu e reduz texto de páginas; ainda pode conter nomes de menus, rotas e documentos privados, então mantenha-o no diretório privado.

O parser registra título, rota sanitizada, menu pai, profundidade, abas, tabelas, formulários consultivos, documentos, avisos e estado de acesso. Query strings com chaves típicas de token são ocultadas. Revisar esse arquivo antes de compartilhamento.
