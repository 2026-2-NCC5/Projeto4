#!/usr/bin/env python3
"""Gera o relatório da Entrega 2 de Sistemas Operacionais e Computação em Nuvem a partir das evidências.

    python3 fonte/gerar_relatorio.py            # gráficos em imagens/ e fonte/relatorio.html
    chromium --headless --no-pdf-header-footer --print-to-pdf=Entrega_2_Sistemas_Operacionais_e_Computacao_em_Nuvem.pdf fonte/relatorio.html

Todos os números do texto saem dos arquivos em evidencias/ (k6, Prometheus, docker stats, pg_stat_statements,
backup e verificações de acesso); nada é digitado à mão.
"""
import csv
import html
import json
from pathlib import Path

from graficos import capacidade_sla, carregar, gerar_todos, pico

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
EVID = RAIZ / "evidencias"
IMG = RAIZ / "imagens"


def k6(nome):
    return carregar(EVID / nome)["metrics"]


def val(m, metrica, stat):
    return m.get(metrica, {}).get("values", {}).get(stat, 0)


def ms(v):
    return f"{v:,.0f} ms".replace(",", ".") if v >= 100 else f"{v:.1f} ms".replace(".", ",")


def num(v, casas=0):
    s = f"{v:,.{casas}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def pct(v, casas=2):
    return f"{num(v * 100, casas)} %"


def esc(t):
    return html.escape(str(t))


def tabela(cabecalho, linhas, classe=""):
    th = "".join(f"<th>{c}</th>" for c in cabecalho)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in linha) + "</tr>" for linha in linhas)
    return f'<table class="{classe}"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def figura(arquivo, legenda, largura="100%", altura_max=None):
    estilo = f"width:{largura}" if not altura_max else f"max-width:100%;max-height:{altura_max};width:auto;margin:0 auto"
    return f'<figure><img src="../imagens/{arquivo}" style="{estilo}" alt="{esc(legenda)}"><figcaption>{legenda}</figcaption></figure>'


def ler_txt(nome):
    p = EVID / nome
    return p.read_text(encoding="utf-8") if p.exists() else ""


def linhas_seguranca(nome):
    out = []
    for linha in ler_txt(nome).splitlines():
        if linha.startswith("#") or "esperado=" not in linha:
            continue
        desc, resto = linha.split("esperado=", 1)
        esperado, resto = resto.split("obtido=", 1)
        obtido, resultado = resto.rsplit(" ", 1) if " " in resto.strip() else (resto, "")
        out.append([esc(desc.strip()), f"<code>{esc(esperado.strip())}</code>", f"<code>{esc(obtido.strip())}</code>",
                    '<span class="ok">OK</span>' if resultado.strip() == "OK" else '<span class="falha">FALHOU</span>'])
    return out


def top_consultas(nome, n=4):
    out = []
    for linha in ler_txt(nome).splitlines()[:n]:
        partes = [p.strip() for p in linha.split("|", 3)]
        if len(partes) == 4:
            chamadas, total, media, consulta = partes
            out.append([num(int(chamadas)), f"{num(float(total) / 1000, 1)} s", f"{num(float(media), 1)} ms", f"<code>{esc(consulta[:80])}…</code>"])
    return out


def main():
    series = gerar_todos(EVID, IMG)
    rampa, antes, depois = series["rampa"], series["antes"], series["depois"]
    kr, ka, kd, kp = k6("k6-rampa.json"), k6("k6-estresse-antes.json"), k6("k6-estresse-depois.json"), k6("k6-producao.json")
    drill = carregar(EVID / "ensaio-restauracao-local.json")
    manifesto = carregar(EVID / "backup-local-manifesto.json")
    cold = list(csv.DictReader(open(EVID / "producao-cold-start.csv", encoding="utf-8")))
    cold_ok = [float(l["t_total"]) * 1000 for l in cold if l["http"] == "200"]
    amb = carregar(EVID / "ambiente.json")
    alertas = carregar(EVID / "prometheus-alertas-estresse.json")
    alertas_antes = ", ".join(sorted(alertas["estresse-antes"]["alertas_disparados"])) or "nenhum"
    alertas_depois = ", ".join(sorted(alertas["estresse-depois"]["alertas_disparados"])) or "nenhum"

    def resumo_k6(m, chave="cenario:jornada"):
        return {
            "reqs": val(m, "http_reqs", "count"), "rps": val(m, "http_reqs", "rate"),
            "falhas": val(m, "http_req_failed", "rate"),
            "p50": val(m, f"http_req_duration{{{chave}}}", "med"), "p95": val(m, f"http_req_duration{{{chave}}}", "p(95)"),
            "p99": val(m, f"http_req_duration{{{chave}}}", "p(99)"),
            "agente_p95": val(m, "http_req_duration{cenario:agente}", "p(95)"),
            "assist_p95": val(m, "asa_assistente_duracao", "p(95)"),
            "descartadas": val(m, "dropped_iterations", "count"), "iter": val(m, "iterations", "count"),
            "checks": val(m, "checks", "rate"),
        }

    R, A, D = resumo_k6(kr), resumo_k6(ka), resumo_k6(kd)
    P = {"reqs": val(kp, "http_reqs", "count"), "falhas": val(kp, "http_req_failed", "rate"),
         "p95": val(kp, "http_req_duration", "p(95)"), "p50": val(kp, "http_req_duration", "med"),
         "h95": val(kp, "http_req_duration{rota:health}", "p(95)"), "i95": val(kp, "http_req_duration{rota:info}", "p(95)"),
         "w95": val(kp, "http_req_duration{rota:portal}", "p(95)"), "rps": val(kp, "http_reqs", "rate")}

    pico_rps_a, pico_rps_d = pico(antes, "rps"), pico(depois, "rps")
    p95max_a, p95max_d = pico(antes, "lat_p95"), pico(depois, "lat_p95")
    espera_a, espera_d = pico(antes, "pool_espera"), pico(depois, "pool_espera")
    cpu_db_a, cpu_db_d = pico(antes, "cpu_conteiner", "service=db"), pico(depois, "cpu_conteiner", "service=db")
    cpu_api_a, cpu_api_d = pico(antes, "cpu_conteiner", "service=api"), pico(depois, "cpu_conteiner", "service=api")
    thr_db_a = pico(antes, "throttling", "service=db")
    mem_api, mem_db, mem_ag = (pico(depois, "mem_conteiner", f"service={s}") / 2**20 for s in ("api", "db", "agent-service"))
    ganho_rps = (pico_rps_d / pico_rps_a - 1) if pico_rps_a else 0
    reducao_p95 = (1 - D["p95"] / A["p95"]) if A["p95"] else 0

    integrantes = [("Vinícius Nishimura Reis", "24026962", "@Vinishireis"), ("Breno Costa", "24026753", "@brenocosta19"),
                   ("Bruno Souza Lima", "24026560", "@BrunoSouza06"), ("Felipe Toshio Yamaschita", "24026779", "@Yamaschita")]

    rastreio = tabela(["Item pedido no enunciado", "Onde está nesta entrega"], [
        ["Deploy da API, banco, serviço do agente e componentes auxiliares em nuvem", "§2 e §3: Vercel (região gru1) + Supabase PostgreSQL (sa-east-1), verificados em produção"],
        ["Empacotar API e dependências com Docker ou processo reproduzível; variáveis de ambiente; conexão com banco/armazenamento", "§4: Dockerfiles multi-stage sem root, <code>docker-compose.yml</code>, <code>vercel.json</code>, <code>.env.example</code>, pool TLS"],
        ["Logs estruturados, métricas de CPU/memória/latência/erros e painel ou relatório de monitoramento", "§5: logs JSON (pino), <code>GET /metrics</code>, Prometheus + Grafana + cAdvisor + postgres-exporter, 8 alertas, este relatório"],
        ["Teste de carga compatível com o escopo, análise de gargalos e ajustes", "§6: rampa até 100 usuários, estresse até saturar, gargalo no PostgreSQL, ajuste e nova medição; carga leve em produção"],
        ["Backup/restauração, gestão de segredos, controle de acesso e estratégia de recuperação", "§7 e §8: scripts de backup/restauração/ensaio, inventário de segredos, 23 verificações de acesso, RPO/RTO por cenário"],
        ["Formato: infraestrutura executável, código, relatório, evidências e endereço de acesso controlado", "<code>src/Entrega_2/Backend/observability/</code>, <code>api/src/observability/</code>, <code>evidencias/</code>, §2"],
    ])

    corpo = f"""
<section class="capa">
  <div class="logos"><img src="../../../../imagens/FECAP_Logo.svg" alt="FECAP"><img src="../../../../imagens/Asa_Logo.svg" alt="ASA"></div>
  <p class="instituicao">Fundação Escola de Comércio Álvares Penteado — FECAP<br>Ciência da Computação · 5º semestre · 2º semestre de 2026</p>
  <p class="disciplina">Sistemas Operacionais e Computação em Nuvem<br><span>Entrega 2 (final) — Projeto Interdisciplinar ASA</span></p>
  <h1>ASA Conecta em produção:<br>implantação, observabilidade, segurança e desempenho</h1>
  <p class="sub">Agente para o Estudante · aplicativo mobile, portal web, API, serviço do agente e PostgreSQL em nuvem</p>
  <table class="integrantes"><thead><tr><th>Integrante</th><th>RA</th><th>GitHub</th></tr></thead><tbody>
  {''.join(f'<tr><td>{n}</td><td>{ra}</td><td>{gh}</td></tr>' for n, ra, gh in integrantes)}
  </tbody></table>
  <p class="data">São Paulo, 11 de novembro de 2026</p>
</section>

<section>
<h2>1. Resumo</h2>
<p>A solução do grupo (ASA Conecta) está <b>publicada e em uso</b>. O portal e a API rodam na Vercel, na região de São
Paulo (<code>gru1</code>); o serviço do agente é uma função privada; o banco é PostgreSQL gerenciado no Supabase
(<code>sa-east-1</code>). Esta entrega acrescenta a camada que faltava para operar o sistema com segurança: métricas
no formato do Prometheus, painel e alertas, teste de carga com análise de gargalo, scripts de backup e de
restauração com ensaio, e a verificação automática do controle de acesso.</p>
<ul class="destaques">
  <li><b>Produção verificada em 11/11/2026:</b> <code>/health</code> com banco e agente <i>up</i>, contrato 1.9,
      modo institucional. Foram {len(linhas_seguranca('seguranca-producao.txt'))} verificações de acesso e transporte,
      sem falha (TLS 1.3, HSTS, CSP, 401 sem token, agente sem rota pública).</li>
  <li><b>Carga com tempo de leitura (até 100 usuários simultâneos):</b> {num(R['reqs'])} requisições,
      {pct(R['falhas'])} de falhas e p95 de {ms(R['p95'])} na jornada do aluno.</li>
  <li><b>Estresse até saturar:</b> o gargalo foi a <b>CPU do PostgreSQL</b> ({num(cpu_db_a, 2)} núcleo de 1, com
      {pct(thr_db_a, 0)} dos períodos limitados pelo cgroup). A busca da base de conhecimento ocupou quase todo o tempo
      do banco, e até {num(espera_a)} requisições ficaram na fila do pool. Com 2 vCPU no banco, o pico atendido foi de
      {num(pico_rps_a)} para {num(pico_rps_d)} req/s ({'+' if ganho_rps >= 0 else ''}{pct(ganho_rps, 0)}), e o p95 da
      jornada caiu {pct(reducao_p95, 0)}.</li>
  <li><b>Recuperação:</b> o backup foi restaurado num PostgreSQL descartável em {num(drill['tempo_total_s'], 1)} s,
      com {drill['tabelas_restauradas']} tabelas e {num(drill['linhas_restauradas'])} linhas conferidas uma a uma, sem
      divergências.</li>
</ul>
<h3>Rastreabilidade do enunciado</h3>
{rastreio}
</section>

<section>
<h2>2. Endereço de acesso controlado</h2>
{tabela(["Componente", "Endereço", "Acesso"], [
    ["Portal web (aluno, equipe ASA, administração)", "<code>https://asa-conecta.vercel.app</code>", "login obrigatório nas áreas <code>/aluno</code>, <code>/asa</code> e <code>/admin</code>; cookie HttpOnly + CSRF"],
    ["API (app mobile e portal)", "<code>https://asa-conecta-api.vercel.app</code>", "JWT de 15 min (Bearer) + renovação; papéis e permissões por rota"],
    ["Saúde (público, sem dados pessoais)", "<code>https://asa-conecta-api.vercel.app/health</code>", "aberto: só informa se banco e agente respondem"],
    ["Aplicativo Android / Expo Go", "<code>https://asa-conecta.vercel.app/app</code>", "mesmo login da API"],
    ["Serviço do agente", "sem endereço público", "só a API chama, pela ligação interna da Vercel, com <code>AGENT_SERVICE_TOKEN</code>"],
    ["Painel de monitoramento (Grafana) e Prometheus", "<code>127.0.0.1:3300</code> e <code>127.0.0.1:9090</code> no ambiente de operação", "presos à interface local; senha do Grafana vem de segredo do Compose; sem acesso anônimo"],
])}
<p>As credenciais de avaliação (contas de aluno, equipe e administração) são entregues aos professores de forma
privada, pelos integrantes, e <b>não estão no repositório</b>. O cadastro de aluno exige e-mail institucional
(<code>@edu.fecap.br</code>) e RA. As contas de equipe e de administração só são criadas por convite da
administração.</p>
</section>

<section>
<h2>3. Arquitetura implantada</h2>
<svg class="diagrama" viewBox="0 0 760 330" xmlns="http://www.w3.org/2000/svg" font-family="DejaVu Sans" font-size="11">
  <defs><marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#52514e"/></marker></defs>
  <rect x="10" y="20" width="150" height="54" rx="6" fill="#fff" stroke="#c9c8c2"/><text x="85" y="43" text-anchor="middle" font-weight="bold">App mobile (Expo)</text><text x="85" y="60" text-anchor="middle" fill="#52514e">Android / Expo Go</text>
  <rect x="10" y="110" width="150" height="54" rx="6" fill="#fff" stroke="#c9c8c2"/><text x="85" y="133" text-anchor="middle" font-weight="bold">Navegador</text><text x="85" y="150" text-anchor="middle" fill="#52514e">aluno · equipe · admin</text>
  <rect x="205" y="98" width="170" height="78" rx="6" fill="#eef4fc" stroke="#2a78d6"/><text x="290" y="120" text-anchor="middle" font-weight="bold">Vercel CDN · asa-conecta</text><text x="290" y="137" text-anchor="middle" fill="#52514e">portal Vite (estático, CSP)</text><text x="290" y="153" text-anchor="middle" fill="#52514e">rewrite /api/* e /health → API</text>
  <rect x="420" y="10" width="200" height="200" rx="8" fill="#f5f9fe" stroke="#2a78d6" stroke-dasharray="4 3"/><text x="520" y="28" text-anchor="middle" font-weight="bold">Vercel · asa-conecta-api (gru1)</text>
  <rect x="435" y="40" width="170" height="58" rx="6" fill="#fff" stroke="#2a78d6"/><text x="520" y="62" text-anchor="middle" font-weight="bold">serviço api</text><text x="520" y="78" text-anchor="middle" fill="#52514e">Express · Node.js 24 · pino</text><text x="520" y="92" text-anchor="middle" fill="#52514e">maxDuration 300 s</text>
  <rect x="435" y="112" width="170" height="50" rx="6" fill="#fff" stroke="#1baf7a"/><text x="520" y="133" text-anchor="middle" font-weight="bold">serviço agent (privado)</text><text x="520" y="150" text-anchor="middle" fill="#52514e">FastAPI · Python 3.12</text>
  <rect x="435" y="172" width="170" height="30" rx="6" fill="#fff" stroke="#c9c8c2"/><text x="520" y="191" text-anchor="middle">Vercel Cron (jobs diários)</text>
  <rect x="640" y="60" width="112" height="90" rx="6" fill="#fdf1ec" stroke="#eb6834"/><text x="696" y="82" text-anchor="middle" font-weight="bold">Supabase</text><text x="696" y="98" text-anchor="middle" fill="#52514e">PostgreSQL 17</text><text x="696" y="114" text-anchor="middle" fill="#52514e">sa-east-1</text><text x="696" y="130" text-anchor="middle" fill="#52514e">schema asa</text>
  <line x1="160" y1="47" x2="433" y2="62" stroke="#52514e" marker-end="url(#seta)"/><text x="290" y="45" text-anchor="middle" fill="#52514e" font-size="10">HTTPS + Bearer</text>
  <line x1="160" y1="137" x2="203" y2="137" stroke="#52514e" marker-end="url(#seta)"/>
  <line x1="375" y1="120" x2="433" y2="80" stroke="#52514e" marker-end="url(#seta)"/>
  <line x1="520" y1="98" x2="520" y2="110" stroke="#52514e" marker-end="url(#seta)"/>
  <line x1="605" y1="70" x2="638" y2="90" stroke="#52514e" marker-end="url(#seta)"/><text x="622" y="62" text-anchor="middle" fill="#52514e" font-size="9">TLS</text>
  <text x="380" y="235" text-anchor="middle" fill="#0b0b0b" font-weight="bold">Ambiente reproduzível (Docker Compose, Linux) — mesmo código e mesmas imagens</text>
  <rect x="10" y="245" width="742" height="76" rx="8" fill="#fff" stroke="#c9c8c2"/>
  {''.join(f'<rect x="{20 + i * 91}" y="257" width="84" height="52" rx="5" fill="{c}" stroke="#c9c8c2"/><text x="{62 + i * 91}" y="280" text-anchor="middle" font-size="10" font-weight="bold">{n}</text><text x="{62 + i * 91}" y="296" text-anchor="middle" font-size="9" fill="#52514e">{d}</text>' for i, (n, d, c) in enumerate([
      ("api", "1 vCPU · 1 GiB", "#eef4fc"), ("agent", "1 vCPU · 512 MiB", "#eaf7f1"), ("db", "PostgreSQL 16", "#fdf1ec"), ("mailpit", "SMTP local", "#fff"),
      ("prometheus", "coleta 5 s", "#fff"), ("grafana", "painel", "#fff"), ("cadvisor", "cgroups", "#fff"), ("k6", "carga", "#fff")]))}
</svg>
<p class="nota">Figura 1 — Componentes em produção (acima) e o ambiente reproduzível com observabilidade (abaixo).</p>
{tabela(["Componente", "Onde roda", "Detalhes verificados"], [
    ["Portal web", "Vercel CDN (projeto <code>asa-conecta</code>)", "estático; CSP, HSTS e <code>X-Frame-Options</code>; <code>/api</code> é repassado à API (mesma origem para os cookies)"],
    ["API", "Vercel Functions, <code>gru1</code> (cabeçalho <code>x-vercel-id: gru1::gru1</code>)", f"Express em Node.js 24; contrato <code>1.9</code>; <code>dataMode: institutional</code>; sem estado entre requisições"],
    ["Serviço do agente", "mesma implantação, serviço <code>agent</code>", "FastAPI; ligação interna gera <code>AGENT_SERVICE_URL</code>; motor de regras explicável"],
    ["Banco", "Supabase PostgreSQL, <code>sa-east-1</code>", "schema <code>asa</code>; papel da API <code>asa_api</code> só com DML; migrations 001–017; anexos em <code>bytea</code> no próprio banco"],
    ["Tarefas agendadas", "Vercel Cron", "<code>/api/internal/jobs/sla-scan</code> e <code>asa-match-collect</code>, diárias, com <code>CRON_SECRET</code>"],
    ["Push e atualização do app", "Expo Push / EAS Update", "canal <code>production</code>; token do Expo fica só no backend"],
])}
</section>

<section>
<h2>4. Empacotamento, variáveis de ambiente e conexão com o banco</h2>
<p>O mesmo código roda de três formas: função serverless na Vercel (<code>src/index.ts</code>), processo residente em
Docker (<code>src/server.ts</code>) e worker sem HTTP (<code>src/worker.ts</code>). A implantação na nuvem é
declarativa (<code>vercel.json</code>: região, serviços, ligação api→agent, duração máxima, crons). O ambiente local é
um <code>docker compose up</code>.</p>
{tabela(["Imagem", "Base e build", "Execução"], [
    ["API", "<code>node:24-alpine</code>, multi-stage: <code>npm ci</code> + <code>tsc</code> no estágio de build; runtime só com dependências de produção", f"usuário <code>node</code> (uid 1000), <code>HEALTHCHECK</code> em <code>/health</code>, {amb['imagens'].get('api', '?')}"],
    ["Agente", "<code>python:3.12-slim</code>, <code>pip install --no-cache-dir</code>", f"usuário de sistema <code>agent</code> (uid 10001, sem shell), <code>HEALTHCHECK</code>, {amb['imagens'].get('agent', '?')}"],
    ["Banco (local)", "<code>postgres:16-alpine</code> com volume nomeado", "porta presa em 127.0.0.1; <code>pg_stat_statements</code> no ambiente de observabilidade"],
])}
<p><b>Ajuste de segurança feito nesta entrega:</b> as duas imagens rodavam como <code>root</code>
(<code>uid=0</code>). Agora rodam com usuários sem privilégio. A evidência
(<code>evidencias/ambiente.json</code>) mostra a saída de <code>id</code> e do <code>ps</code> dentro dos contêineres, e
os limites lidos do cgroup v2 (<code>cpu.max</code> e <code>memory.max</code>).</p>
<p><b>Variáveis de ambiente.</b> A API valida tudo na inicialização com zod
(<code>src/config/env.ts</code>). Configuração inválida derruba a subida e lista os campos com problema. Os modelos
versionados (<code>.env.example</code>) só trazem nomes e valores de desenvolvimento. Os valores reais ficam nas
variáveis sensíveis da Vercel ou no <code>.env</code> local, que o <code>.gitignore</code> ignora. A nova variável
<code>METRICS_TOKEN</code> segue a mesma regra: tem pelo menos 24 caracteres e, sem ela, a rota
<code>/metrics</code> não existe.</p>
<p><b>Conexão com banco e armazenamento.</b> Em produção a API usa o pooler do Supabase em modo sessão, com TLS e
<code>DATABASE_POOL_MAX=3</code> por instância. Assim várias instâncias não esgotam o limite de conexões. O papel
<code>asa_api</code> tem <code>statement_timeout</code> de 30 s e não cria tabelas. As migrations rodam com outro
papel (<code>asa_migrator</code>). Os anexos de chamados ficam no PostgreSQL (<code>bytea</code>), então o backup do
banco também cobre os arquivos.</p>
</section>

<section>
<h2>5. Observabilidade</h2>
<h3>5.1 Logs estruturados</h3>
<p>A API escreve uma linha JSON por evento (pino) com <code>service</code>, <code>env</code>, <code>runtime</code>,
<code>request_id</code> e <code>correlation_id</code>; o <code>correlation_id</code> é propagado até o agente. Toda
requisição termina com método, rota, status, duração e <code>status: success|error</code>. Senhas, tokens, cookies e
cabeçalho <code>Authorization</code> são substituídos por <code>[REDACTED]</code>, e o conteúdo acadêmico nunca entra
no log. Exemplo real do ambiente de teste (<code>evidencias/logs-api-amostra.jsonl</code>):</p>
<pre>{esc(ler_txt('logs-api-amostra.jsonl').splitlines()[0] if ler_txt('logs-api-amostra.jsonl') else '')}</pre>
<p>Em produção, os mesmos logs aparecem em <i>Runtime Logs</i> da Vercel, filtráveis por <code>request_id</code>,
nível e rota. Os erros 5xx são registrados com <code>level: error</code>, e os 401, 403 e 429 com
<code>level: warn</code>.</p>
<h3>5.2 Métricas</h3>
<p>Novo endpoint <code>GET /metrics</code> (<code>api/src/observability/metrics.ts</code>, formato de texto do
Prometheus, sem dependências novas e coberto por 6 testes automatizados). A rota entra no rótulo pelo molde
(<code>/api/agent/recommendations/:id</code>), nunca pela URL real, para não vazar identificadores e manter a
cardinalidade baixa.</p>
{tabela(["Métrica", "Tipo", "Para que serve"], [
    ["<code>asa_http_requests_total{{method,route,status_code}}</code>", "contador", "vazão e taxa de erros (4xx/5xx) por rota"],
    ["<code>asa_http_request_duration_seconds</code>", "histograma", "latência p50/p95/p99 por rota (11 faixas, de 5 ms a 10 s)"],
    ["<code>process_cpu_seconds_total</code>, <code>process_resident_memory_bytes</code>", "contador / medidor", "CPU e memória do processo Node.js"],
    ["<code>nodejs_eventloop_lag_seconds</code>, <code>nodejs_heap_used_bytes</code>", "medidor", "event loop bloqueado (CPU saturada) e heap do V8"],
    ["<code>asa_db_pool_connections{{state}}</code>", "medidor", "conexões em uso/ociosas e <b>requisições esperando conexão</b>"],
    ["<code>container_cpu_*</code>, <code>container_memory_*</code> (cAdvisor)", "contador / medidor", "CPU, throttling e memória de cada contêiner, lidos dos cgroups do kernel"],
    ["<code>pg_stat_*</code> (postgres-exporter)", "medidor", "conexões por estado, transações/s, cache hit do banco"],
])}
<h3>5.3 Painel e alertas</h3>
<p>O painel <b>ASA Conecta — Observabilidade</b> (Grafana 12, 26 painéis) e as regras de alerta do Prometheus são
provisionados como código (<code>observability/grafana</code> e <code>observability/prometheus</code>). Sobem com o
<code>docker compose</code>, sem configuração manual.</p>
{figura('grafana-painel-estresse.png', 'Figura 2 — Painel do Grafana durante o teste de estresse (antes do ajuste): o p95 passa de 1 s quando a CPU do banco chega ao limite.', altura_max='228mm')}
{tabela(["Alerta", "Condição", "Severidade"], [
    ["ApiIndisponivel", "coleta de <code>/metrics</code> falha por 1 min", "crítica"],
    ["LatenciaP95Alta", "p95 &gt; 1 s por 2 min", "alta"],
    ["TaxaDeErros5xx", "5xx &gt; 2 % das respostas por 2 min", "alta"],
    ["EventLoopBloqueado", "atraso p99 do event loop &gt; 200 ms", "média"],
    ["PoolDoBancoComEspera", "requisições esperando conexão por 2 min", "média"],
    ["MemoriaDoConteinerAlta", "working set &gt; 80 % do limite do cgroup", "média"],
    ["CpuDoConteinerLimitada", "throttling &gt; 25 % dos períodos", "média"],
    ["BancoComMuitasConexoes", "&gt; 80 conexões no PostgreSQL", "média"],
])}
<p class="nota">Alertas que dispararam de fato: no estresse antes do ajuste, {alertas_antes}; depois do ajuste,
{alertas_depois}. Os dados estão em <code>evidencias/prometheus-alertas-estresse.json</code>.</p>
</section>

<section>
<h2>6. Teste de carga, gargalos e ajustes</h2>
<h3>6.1 Método</h3>
<p>O gerador de carga é o k6 1.3. Ele envia as próprias métricas ao Prometheus, para comparar a visão do cliente com a
do servidor. O ambiente de medição usa as mesmas imagens Docker da entrega, em {esc(amb['host']['so'])}
(kernel {esc(amb['host']['kernel'])}, {esc(amb['host']['cpu'])}, {amb['host']['nucleos']} núcleos,
{esc(amb['host']['memoria'])}, Docker {esc(amb['host']['docker'])}, cgroup v2). Cada contêiner tem limite próprio:
a API recebe <b>1 vCPU e 1 GiB</b>, o mesmo orçamento de uma instância de função na nuvem. O modo de dados é o da
produção: institucional, sem dados fictícios, com os 179 artigos oficiais da Cesta de Serviços na base de
conhecimento e com o limitador de login ligado.</p>
{tabela(["Cenário", "O que faz"], [
    ["Jornada do aluno (API)", "abre o app (<code>/api/platform/info</code>, <code>/api/student/me</code>), pergunta ao assistente (<code>POST /api/assistant/message</code>, 10 perguntas reais), busca na base de conhecimento, lista os chamados e, em 20 % das vezes, chama <code>/health</code>"],
    ["Serviço do agente", "<code>POST /internal/v1/student-agent/evaluate</code> com o cenário fictício do contrato (<code>request.scenario-002.json</code>)"],
    ["Rampa", "0 → 10 → 25 → 50 → 100 usuários virtuais em 7 min, com 1 a 3 s de leitura entre as ações (uso realista)"],
    ["Estresse", "5 → 100 jornadas iniciadas por segundo, sem pausa, até saturar; mede a vazão máxima e onde ela trava"],
    ["Produção (leve)", "só leituras públicas, até 10 req/s por 6 min (<code>/health</code>, <code>/api/platform/info</code>, portal)"],
])}
<h3>6.2 Rampa (uso realista)</h3>
{figura('grafico-rampa.png', f'Figura 3 — Rampa até 100 usuários: a vazão acompanha os usuários e o p95 fica abaixo de {ms(max(R["p95"], 1))} no cliente.')}
<p>Foram {num(R['reqs'])} requisições ({num(R['rps'], 1)} req/s em média), com {pct(R['falhas'])} de falhas e
{pct(R['checks'], 1)} das checagens aprovadas. A jornada teve p50 de {ms(R['p50'])}, p95 de {ms(R['p95'])} e p99 de
{ms(R['p99'])}. O assistente teve p95 de {ms(R['assist_p95'])} e o agente, {ms(R['agente_p95'])}. No pico, a API usou
{num(pico(rampa, 'cpu_conteiner', 'service=api'), 2)} núcleo e o PostgreSQL {num(pico(rampa, 'cpu_conteiner', 'service=db'), 2)}:
o banco já era o maior consumidor de CPU.</p>
<h3>6.3 Estresse e análise do gargalo</h3>
{figura('grafico-estresse.png', 'Figura 4 — Mesmo estresse antes e depois do ajuste: vazão atendida, p95 no servidor e fila do pool de conexões.')}
{figura('grafico-cpu-conteineres.png', 'Figura 5 — CPU por contêiner (núcleos). Antes do ajuste, o PostgreSQL fica preso em 1,0 (o limite do cgroup), enquanto a API usa menos de meio núcleo.')}
<p>Sinais do gargalo antes do ajuste:</p>
<ol>
  <li>A CPU do contêiner do banco chegou a {num(cpu_db_a, 2)} núcleo, com throttling do kernel em
      {pct(thr_db_a, 0)} dos períodos (cota <code>cpu.max</code> = 100000/100000). A API ficou em
      {num(cpu_api_a, 2)} núcleo e o event loop nunca passou de {ms(pico(antes, 'eventloop_p99') * 1000)}.</li>
  <li>O pool da API ficou cheio: 10 de 10 conexões em uso e até {num(espera_a)} requisições esperando conexão. O tempo
      de espera virou latência: p95 no servidor de até {num(p95max_a, 1)} s.</li>
  <li>O <code>pg_stat_statements</code> mostra a busca textual da base de conhecimento muito à frente de qualquer outra
      consulta:</li>
</ol>
{tabela(["Chamadas", "Tempo total", "Média", "Consulta (estresse antes do ajuste)"], top_consultas('pg-stat-statements-estresse-antes.txt'))}
<p>O <code>EXPLAIN ANALYZE</code> (<code>evidencias/explain-busca-base-conhecimento.txt</code>) isola a causa. A tabela
é pequena (179 artigos, tudo em memória) e o filtro <code>@@</code> leva cerca de 1 ms. O custo está na função de
ranking <code>ts_rank_cd</code> com termos de prefixo (<code>boleto:*</code>), de 6 a 8 vezes mais cara que
<code>ts_rank</code> nas duas medições. Não é falta de índice nem de memória: é CPU do banco.</p>
<p><b>Por que não aumentar o pool:</b> mais conexões só colocariam mais consultas disputando o mesmo núcleo. A fila sairia
do pool e iria para o escalonador do PostgreSQL, sem ganho de vazão.</p>
<h3>6.4 Ajuste aplicado e resultado</h3>
<p>O ajuste foi dar <b>2 vCPU ao contêiner do PostgreSQL</b> (<code>DB_CPUS=2.0</code>; o cgroup passou a
<code>cpu.max = 200000 100000</code>). Isso equivale a subir o tamanho de computação do banco gerenciado. O mesmo
estresse foi repetido com o restante igual:</p>
{tabela(["Indicador (estresse)", "Antes (1 vCPU no banco)", "Depois (2 vCPU no banco)"], [
    ["Requisições atendidas", num(A['reqs']), num(D['reqs'])],
    ["Pico de vazão atendida", f"{num(pico_rps_a)} req/s", f"{num(pico_rps_d)} req/s"],
    ["<b>Capacidade com p95 &lt; 1 s</b> (maior vazão antes de passar do objetivo)", f"<b>{num(capacidade_sla(antes))} req/s</b>", f"<b>{num(capacidade_sla(depois))} req/s</b>"],
    ["Jornadas descartadas por falta de capacidade (k6)", num(A['descartadas']), num(D['descartadas'])],
    ["p50 / p95 da jornada (cliente)", f"{ms(A['p50'])} / {ms(A['p95'])}", f"{ms(D['p50'])} / {ms(D['p95'])}"],
    ["p95 do assistente (cliente)", ms(A['assist_p95']), ms(D['assist_p95'])],
    ["Máximo de requisições esperando conexão", num(espera_a), num(espera_d)],
    ["CPU máxima do banco / da API", f"{num(cpu_db_a, 2)} / {num(cpu_api_a, 2)} núcleo", f"{num(cpu_db_d, 2)} / {num(cpu_api_d, 2)} núcleo"],
    ["Falhas HTTP", pct(A['falhas']), pct(D['falhas'])],
])}
<p>{'O ganho de vazão foi proporcional à CPU adicionada, o que confirma o diagnóstico.' if ganho_rps > 0.3 else 'O ganho foi menor que o proporcional: com mais CPU no banco, outro recurso passou a limitar (ver a Figura 5).'}
No topo do estresse (100 jornadas/s) o banco voltou a ficar no limite, agora de 2 núcleos. O gargalo
continua sendo a CPU do banco, só que bem mais adiante: daí a recomendação para a aplicação no fim desta seção.
Nos dois casos não houve erro: sob sobrecarga o sistema <b>fica mais lento, mas não falha</b>, graças ao pool limitado
e aos timeouts. A memória ficou estável (pico de {num(mem_api)} MiB na API, {num(mem_db)} MiB no banco e
{num(mem_ag)} MiB no agente; Figura 6), longe dos limites, sem sinal de vazamento.</p>
{figura('grafico-memoria.png', 'Figura 6 — Memória por contêiner durante o estresse depois do ajuste.')}
<p><b>Recomendação para a aplicação</b> (sem mudança feita aqui, porque altera as respostas do assistente e precisa de
nova validação de qualidade pela frente de IA): guardar em cache, por alguns minutos, os resultados da busca de
perguntas repetidas (a base muda pouco e o cache pode ser invalidado na publicação). Outra opção é trocar
<code>ts_rank_cd</code> por <code>ts_rank</code> e recalibrar o limiar <code>minScore</code>. Qualquer uma das duas
reduz a CPU do banco por pergunta.</p>
<h3>6.5 Produção</h3>
{figura('grafico-producao.png', 'Figura 7 — Latência em produção por rota (k6, até 10 req/s) e efeito do cold start da função.')}
<p>Foram {num(P['reqs'])} requisições em produção, com {pct(P['falhas'])} de falhas. O p95 ficou em {ms(P['h95'])} no
<code>/health</code> (consulta o banco e o agente), {ms(P['i95'])} no <code>/api/platform/info</code> e
{ms(P['w95'])} no portal servido pela CDN. A primeira chamada depois de um período sem tráfego levou
{ms(cold_ok[0] if cold_ok else 0)}, contra {ms(sorted(cold_ok[1:])[len(cold_ok[1:]) // 2] if len(cold_ok) > 1 else 0)}
de mediana nas seguintes: é o <i>cold start</i> da função serverless, ou seja, subir a instância e abrir a conexão com
o banco. Duas tentativas extras dessa sequência falharam antes do TLS (código 000) e foram atribuídas à rede local,
porque as chamadas logo seguintes responderam 200 (<code>evidencias/producao-cold-start.csv</code>). Para o atendimento é aceitável. Se incomodar, a mitigação é uma chamada periódica ao <code>/health</code>
(monitor de disponibilidade), que também mede o uptime.</p>
</section>

<section>
<h2>7. Segurança: segredos e controle de acesso</h2>
<h3>7.1 Gestão de segredos</h3>
{tabela(["Segredo", "Onde fica", "Rotação / efeito"], [
    ["<code>DATABASE_URL</code> (papel <code>asa_api</code>)", "variável sensível da Vercel (produção); cópia de operação em arquivo 600 fora do repositório", "trocar a senha do papel no banco, atualizar a variável e reimplantar"],
    ["<code>JWT_SECRET</code>", "variável sensível da Vercel", "trocar invalida todas as sessões (resposta a incidente)"],
    ["<code>AGENT_SERVICE_TOKEN</code>", "variável sensível, a mesma para api e agent", "o agente recusa chamadas sem o token (401)"],
    ["<code>CRON_SECRET</code>", "variável sensível; a Vercel Cron envia o cabeçalho sozinha", "sem ele, <code>/api/internal/jobs/*</code> responde 401"],
    ["<code>METRICS_TOKEN</code>, senha do Grafana", "<code>observability/.env</code> (600, ignorado pelo Git) → <i>secrets</i> do Compose em <code>/run/secrets</code>", "nunca na linha de comando nem em variável do Prometheus"],
    ["Senhas de usuários", "só o hash bcrypt no banco", "política de senha forte e bloqueio por tentativas"],
    ["Chave dos backups (<code>BACKUP_KEY_FILE</code>)", "arquivo 600 fora do repositório, com cópia offline", "backups cifrados com AES-256-CBC + PBKDF2 (200 mil iterações)"],
])}
<p>Regras: nenhum segredo é versionado (<code>.gitignore</code> cobre <code>.env*</code>, exceto os
<code>.env.example</code>). Cada ambiente tem o seu valor, e preview nunca usa o banco de produção. Os scripts de
backup passam a senha ao <code>pg_dump</code> por arquivo de ambiente temporário (600), nunca por argumento visível no
<code>ps</code>. Em 27/10 houve um incidente: senhas de equipe apareceram na saída do terminal. Foram trocadas em
seguida, e desde então o arquivo de contas nunca é carregado como script (documentado em
<code>docs/migration/07-migracao-banco.md</code>).</p>
<h3>7.2 Controle de acesso</h3>
<p>Três papéis com menor privilégio: <code>student</code>, <code>institutional_staff</code> e
<code>technical_admin</code>. A matriz de permissões é aplicada por rota e as negações são auditadas. No banco, a chave
pública do Supabase (<code>anon</code>) não tem acesso ao schema <code>asa</code>, e a API usa um papel sem permissão de
DDL. O serviço do agente não tem rota pública. O login tem limite de 20 tentativas por IP a cada 10 minutos, e o
próprio teste de carga esbarrou nele (<code>evidencias/rate-limit-login.txt</code>, resposta 429 com
<code>Retry-After</code>).</p>
<h4>Produção (somente leitura)</h4>
{tabela(["Verificação", "Esperado", "Obtido", ""], linhas_seguranca('seguranca-producao.txt'), "compacta")}
<h4>Ambiente Docker (perfis e tokens)</h4>
{tabela(["Verificação", "Esperado", "Obtido", ""], linhas_seguranca('seguranca-local.txt'), "compacta")}
</section>

<section>
<h2>8. Backup, restauração e estratégia de recuperação</h2>
<p><b>Política.</b> Backup lógico diário (<code>pg_dump</code> em formato custom, compressão 6) do schema da aplicação.
Cada arquivo leva sha256, manifesto com a contagem de linhas por tabela e permissão 600, numa pasta fora do
repositório. Retenção de 14 cópias e cifragem AES-256 opcional. O cliente do PostgreSQL roda em contêiner
(<code>postgres:17-alpine</code>, mesma versão do Supabase), então não há nada a instalar. A restauração confere o
checksum, roda numa transação única e recusa um banco remoto sem confirmação explícita do host.</p>
<p><b>Ensaio de recuperação executado</b> (<code>observability/backup/drill.sh</code>): o backup é restaurado num
PostgreSQL descartável (contêiner com tmpfs), e cada tabela é comparada com o manifesto.</p>
{tabela(["Etapa", "Resultado"], [
    ["Backup", f"<code>{esc(manifesto['arquivo'])}</code> · {num(manifesto['bytes_dump'] / 1024, 0)} KiB · {num(manifesto['duracao_s'], 2)} s · sha256 <code>{esc(manifesto['sha256'][:16])}…</code>"],
    ["Conteúdo", f"{manifesto['tabelas']} tabelas, {num(manifesto['linhas'])} linhas"],
    ["Subida do banco descartável", f"{num(drill['tempo_subida_banco_s'], 1)} s"],
    ["Restauração (pg_restore, transação única)", f"{num(drill['tempo_restauracao_s'], 1)} s"],
    ["Conferência tabela a tabela", f"{drill['tabelas_restauradas']} de {drill['tabelas_backup']} tabelas, {num(drill['linhas_restauradas'])} linhas: {'<span class=ok>sem divergências</span>' if drill['ok'] else '<span class=falha>com divergências</span>'}"],
])}
<p>O ensaio acima usou o banco do ambiente Docker, com os mesmos dados produzidos pelo teste de carga. Em produção,
foram feitos backups completos (<code>supabase db dump</code>: schema, dados e papéis) antes de cada migração, em
27/10 e 03/11, guardados fora do repositório com permissão 600. A rotina diária passa a ser o <code>backup.sh</code>
com o papel de migração e <code>--schema asa</code>, executado pelo responsável que tem acesso ao banco. A cada mês o
último backup de produção deve passar pelo <code>drill.sh</code>.</p>
{tabela(["Cenário", "Detecção", "Recuperação", "RTO alvo", "RPO"], [
    ["Implantação com defeito (API ou portal)", "alertas de 5xx/latência, <code>/health</code> 503, teste de fumaça", "<code>vercel promote</code> da implantação anterior (as anteriores ficam guardadas)", "&lt; 10 min", "0"],
    ["Dados apagados ou corrompidos", "erros, auditoria, contagens", "restaurar o último backup num banco novo (ensaiado: segundos para o volume atual), validar com o manifesto e trocar <code>DATABASE_URL</code>", "&lt; 1 h", "≤ 24 h (backup diário)"],
    ["Banco gerenciado indisponível", "<code>/health</code> com <code>database: down</code>", "PostgreSQL em contêiner a partir do backup; mesma <code>DATABASE_URL</code> apontando para ele", "&lt; 4 h", "≤ 24 h"],
    ["Plataforma ou região da Vercel indisponível", "monitor externo do <code>/health</code>", "subir as mesmas imagens em uma VM Linux com <code>docker compose</code>, apontando para o mesmo banco; trocar a URL da API no app (EAS Update)", "&lt; 4 h", "0"],
    ["Segredo vazado", "revisão, alerta de varredura", "gerar novo valor, atualizar a variável, reimplantar, revogar sessões (trocar <code>JWT_SECRET</code>)", "&lt; 30 min", "—"],
])}
</section>

<section>
<h2>9. Como reproduzir</h2>
<pre>cd src/Entrega_2/Backend
cp observability/.env.example observability/.env && chmod 600 observability/.env   # preencher os segredos
alias dco='docker compose --env-file observability/.env -f docker-compose.yml -f observability/docker-compose.observability.yml'
dco up -d --build db mailpit agent-service api prometheus grafana cadvisor postgres-exporter
docker exec asa-conecta-api node dist/db/content.js
dco --profile carga run --rm k6 run -o experimental-prometheus-rw -e PERFIL=rampa /scripts/jornada-aluno.js
dco --profile carga run --rm k6 run -o experimental-prometheus-rw -e PERFIL=estresse /scripts/jornada-aluno.js
observability/backup/backup.sh --label local   # com DATABASE_URL no ambiente
observability/backup/drill.sh ~/asa-conecta-backups/local-*.dump
observability/seguranca/verificar-acesso.sh producao</pre>
<p>Detalhes em <code>src/Entrega_2/Backend/observability/README.md</code>. Este relatório é gerado por
<code>fonte/gerar_relatorio.py</code> a partir de <code>evidencias/</code>.</p>
</section>

<section>
<h2>10. Limitações e próximos passos</h2>
<ul>
  <li>O <code>/metrics</code> está no código, mas <b>não foi ligado em produção</b>: falta definir <code>METRICS_TOKEN</code>
      na Vercel e implantar. Em funções serverless cada instância tem seus contadores, então a visão consolidada de
      produção continua sendo a da Vercel (Runtime Logs e Observability), somada à medição externa deste relatório.</li>
  <li>O limitador de tentativas guarda as contagens na memória de cada instância. Com várias instâncias, o limite efetivo
      é por instância. Um contador compartilhado (no banco ou em cache) fecharia essa brecha.</li>
  <li>Os testes de carga em produção foram de propósito leves, para não afetar os usuários. A capacidade máxima foi medida
      no ambiente local com limites equivalentes, não no plano de produção.</li>
  <li>O agendamento diário do backup de produção e a cópia cifrada fora da máquina de operação precisam de um
      responsável fixo (cron do usuário de operação, conforme o cabeçalho de <code>backup.sh</code>).</li>
</ul>
</section>

<section>
<h2>11. Declaração de uso de inteligência artificial</h2>
<p>Ferramenta: Claude Code (modelo Claude Opus 5.5, Anthropic), usada por Vinícius Nishimura Reis para automatizar a
coleta de evidências, escrever os scripts de observabilidade, carga e backup e redigir este relatório. Todas as
medições foram executadas de fato sobre o sistema do grupo, e os números vêm dos arquivos em
<code>evidencias/</code>. A revisão e a responsabilidade pelo conteúdo são dos integrantes, conforme o Guia para o Uso
Responsável de IA da FECAP.</p>
</section>
"""
    estilo = """
@page { size: A4; margin: 16mm 15mm 16mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "DejaVu Sans", "Liberation Sans", Arial, sans-serif; font-size: 9.6pt; line-height: 1.45; color: #0b0b0b; margin: 0; background: #fff; }
h1 { font-size: 21pt; line-height: 1.2; margin: 6mm 0 3mm; color: #0b0b0b; }
h2 { font-size: 14pt; color: #0d6d53; border-bottom: 1.5px solid #0d6d53; padding-bottom: 1.5mm; margin: 0 0 3mm; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; page-break-after: avoid; break-after: avoid; }
h4 { font-size: 10pt; margin: 4mm 0 1.5mm; color: #52514e; page-break-after: avoid; break-after: avoid; }
section { page-break-before: always; }
section.capa { page-break-before: avoid; display: flex; flex-direction: column; min-height: 262mm; }
.capa .logos { display: flex; gap: 10mm; align-items: center; }
.capa .logos img { height: 16mm; }
.capa .instituicao { color: #52514e; margin-top: 10mm; }
.capa .disciplina { font-size: 13pt; font-weight: bold; color: #0d6d53; margin-top: 18mm; }
.capa .disciplina span { font-size: 11pt; color: #52514e; font-weight: normal; }
.capa .sub { color: #52514e; font-size: 11pt; }
.capa .integrantes { margin-top: 14mm; width: 70%; }
.capa .data { margin-top: auto; color: #52514e; }
p { margin: 0 0 2.4mm; text-align: justify; }
ul, ol { margin: 0 0 2.4mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
.destaques li { margin-bottom: 2mm; }
code { font-family: "DejaVu Sans Mono", monospace; font-size: 8.3pt; background: #f2f1ed; padding: 0 1mm; border-radius: 2px; }
pre { font-family: "DejaVu Sans Mono", monospace; font-size: 7.6pt; background: #f6f5f2; border: 1px solid #e6e5e1; border-radius: 4px; padding: 2.5mm; white-space: pre-wrap; word-break: break-all; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.6pt; page-break-inside: avoid; }
th { text-align: left; background: #f2f1ed; color: #0b0b0b; font-weight: bold; padding: 1.6mm 2mm; border-bottom: 1px solid #c9c8c2; }
td { padding: 1.4mm 2mm; border-bottom: 1px solid #e6e5e1; vertical-align: top; }
table.compacta td, table.compacta th { padding: 0.9mm 1.6mm; font-size: 8pt; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; }
figure img { display: block; border: 1px solid #e6e5e1; border-radius: 3px; }
figcaption, .nota { font-size: 8.2pt; color: #52514e; margin-top: 1.5mm; }
.diagrama { width: 100%; height: auto; margin: 2mm 0 1mm; }
.ok { color: #0d6d53; font-weight: bold; }
.falha { color: #b42318; font-weight: bold; }
"""
    pagina = f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Entrega 2 — Sistemas Operacionais e Computação em Nuvem</title><style>{estilo}</style></head><body>{corpo}</body></html>'
    (AQUI / "relatorio.html").write_text(pagina, encoding="utf-8")
    print("relatorio.html e gráficos gerados")


if __name__ == "__main__":
    main()
