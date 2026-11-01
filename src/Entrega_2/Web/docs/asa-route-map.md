# Mapa de rotas do ASA Conecta

## Experiência pública

| Área | Rota | Destino |
|---|---|---|
| Portal público ASA | `/` | Homepage do ASA |
| Alias legado | `/asa-conecta` | Redireciona para `/` |
| Conheça o ASA | `/conheca-o-asa` | Página pública institucional do ASA |
| Cesta de Serviços | `/cesta-de-servicos` | Catálogo local de serviços confirmados e links para a fonte oficial |
| Carreira | `/carreira` | Oportunidades e orientações oficiais |
| Empresas | `/empresas` | Relacionamento empresarial e plataforma oficial |
| Equipe | `/equipe` | Equipe ASA publicada nas fontes institucionais |
| Atendimento | `/atendimento` | Canais oficiais do ASA |

O domínio público deste projeto apresenta exclusivamente a experiência do ASA. Páginas da FECAP não são replicadas
nem servidas localmente; logotipos, portal acadêmico e catálogos da FECAP aparecem somente como identidade institucional
ou links externos necessários aos serviços do ASA.

## Áreas autenticadas

| Área | Rota | Acesso |
|---|---|---|
| Estudante | `/aluno/*` | Sessão autenticada e papel de estudante |
| Equipe ASA | `/asa/*` | Sessão autenticada e papel de equipe institucional |
| Administração | `/admin/*` | Sessão autenticada e papel de administração técnica |

## Rotas que saíram do escopo local

Rotas como `/graduacao/*`, `/institucional/*`, `/colegio/*` e `/alumni/*` não representam páginas locais do ASA. Para
essas informações, o usuário deve seguir os links oficiais externos disponibilizados nos serviços correspondentes.
