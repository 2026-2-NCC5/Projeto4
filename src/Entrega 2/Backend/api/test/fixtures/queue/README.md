# Fixtures da fila presencial (presencial.fecap.br)

Capturadas em 06/10/2026 (~20:47, horário de Brasília) e reduzidas:

| Arquivo | Origem |
| --- | --- |
| `fecap-portal-page.html` | Estrutura real da página (listas `entity-grid` com `data-view-layouts`). A configuração segura de cada lista foi trocada por `FIXTURE-SECURE-CONFIG-*`. |
| `fecap-tokenhtml.html` | Formato real de `/_layout/tokenhtml` com token fictício. |
| `fecap-grid-calls.json` | Resposta real de "SENHAS ANTERIORES" (`/_services/entity-grid-data.json`), sem `AttributeMetadata`. |
| `fecap-grid-waiting-empty.json` | Resposta real de "PRÓXIMAS SENHAS" vazia. |
| `fecap-grid-waiting.json` | **Sintética**: a lista estava vazia na captura; segue o mesmo formato de atributos das chamadas. |
