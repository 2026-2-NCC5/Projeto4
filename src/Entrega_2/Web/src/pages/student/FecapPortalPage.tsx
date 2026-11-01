import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpenCheck, CircleHelp, ExternalLink, FileText, LockKeyhole, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { fecapPortalApi } from '@/services/api/endpoints';
import { fecapCollectorApi } from '@/services/api/fecapCollector';

const MODULES = [
  ['profile', 'Perfil acadêmico'],
  ['subjects', 'Disciplinas'],
  ['grades', 'Notas'],
  ['attendance', 'Frequência'],
  ['schedule', 'Horários'],
  ['documents', 'Documentos'],
  ['requests', 'Requerimentos'],
  ['internships', 'Estágios'],
  ['financial', 'Financeiro'],
] as const;

export default function FecapPortalPage() {
  const query = useQuery({ queryKey: ['fecap-portal', 'capabilities'], queryFn: fecapPortalApi.capabilities, retry: 1, staleTime: 60_000 });
  const [collectorToken, setCollectorToken] = useState('');
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMessage, setTokenMessage] = useState('');
  const [dataVisible, setDataVisible] = useState(false);
  const [localPermissionMessage, setLocalPermissionMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const portalUrl = query.data?.officialPortalUrl ?? 'https://portal.fecap.br/';
  const localStatus = useQuery({
    queryKey: ['fecap-local-agent', 'status'],
    queryFn: () => fecapCollectorApi.status(collectorToken),
    enabled: false,
    retry: false,
    refetchInterval: (current) => ['queued', 'running'].includes(current.state.data?.scan?.status ?? '') ? 1500 : false,
  });
  const localData = useQuery({
    queryKey: ['fecap-local-agent', 'data', searchTerm],
    queryFn: () => fecapCollectorApi.data(collectorToken, searchTerm),
    enabled: Boolean(collectorToken && dataVisible && localStatus.data?.authenticated && localStatus.data.scan.status === 'completed'),
    retry: false,
  });

  const createCollectorToken = async () => {
    setTokenBusy(true);
    setTokenMessage('');
    setDataVisible(false);
    try {
      const result = await fecapPortalApi.createLocalCollectorToken();
      setCollectorToken(result.syncToken);
      setTokenMessage('Token local emitido. Ele ficará somente nesta tela até você sair dela.');
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : 'Não foi possível preparar o acesso local.');
    } finally {
      setTokenBusy(false);
    }
  };

  const startLocalScan = async () => {
    try {
      const result = await fecapCollectorApi.startScan(collectorToken);
      setTokenMessage(result.message);
      setDataVisible(false);
      await localStatus.refetch();
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : 'Não foi possível iniciar a leitura local.');
    }
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(collectorToken);
      setTokenMessage('Token copiado. Cole em ASA_INTERNAL_SYNC_TOKEN no `.env` local do coletor.');
    } catch {
      setTokenMessage('Não foi possível copiar automaticamente. Selecione o token e copie manualmente.');
    }
  };

  const checkLocalAgent = async () => {
    setLocalPermissionMessage('');
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: 'loopback-network' as PermissionName });
        if (permission.state === 'denied') {
          setLocalPermissionMessage('O navegador bloqueou o acesso local. Permita o acesso à rede local nas configurações deste site e tente novamente.');
          return;
        }
      }
    } catch {
      // Navegadores sem a API de permissão seguem com a solicitação explícita abaixo.
    }
    await localStatus.refetch();
  };

  return (
    <>
      <PageHeader
        eyebrow="Integração institucional"
        title="Portal Educacional FECAP"
        description="Consulte o status real da integração do ASA Conecta e acesse o ambiente oficial da FECAP."
        actions={<a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-action px-4 py-2 text-small font-semibold text-white hover:bg-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Abrir portal oficial <ExternalLink size={16} aria-hidden /></a>}
      />

      {query.isError ? (
        <Surface className="mb-5" role="alert">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-ink">Não foi possível consultar o status agora. O acesso ao portal oficial continua disponível.</p>
            <Button size="sm" icon={RefreshCw} onClick={() => void query.refetch()}>Tentar novamente</Button>
          </div>
        </Surface>
      ) : null}

      <Surface className="mb-5 border-green-200 bg-[#f2faf5]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone="warning" icon={LockKeyhole}>Integração institucional pendente</Badge></div>
            <h2 className="text-h3 font-semibold text-ink">Sua conta FECAP não está conectada ao ASA Conecta</h2>
            <p className="mt-2 text-body text-slate">Ainda não há SSO ou API institucional confirmados e configurados neste ambiente. O ASA Conecta não pede nem armazena sua senha FECAP. Entre diretamente no domínio oficial para consultar seus dados acadêmicos.</p>
          </div>
          <a href={portalUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir Portal do Aluno FECAP em nova aba" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-action bg-white px-4 py-2 text-small font-semibold text-action hover:bg-green-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Portal do Aluno <ArrowUpRight size={16} aria-hidden /></a>
        </div>
      </Surface>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <SectionHeader id="modules" title="Disponibilidade no ASA Conecta" description="Os módulos abaixo ainda não consultam os registros do Portal Educacional FECAP." />
          <ul aria-labelledby="modules" className="grid gap-2 sm:grid-cols-2">
            {MODULES.map(([key, label]) => (
              <li key={key} className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line-soft bg-white px-3 py-2">
                <span className="text-small font-medium text-ink">{label}</span>
                <Badge tone="neutral">Não integrado</Badge>
              </li>
            ))}
          </ul>
          {query.data?.localReadOnlyCollector === 'experimental' ? <p className="mt-4 border-t border-line-soft pt-3 text-caption text-slate">O agente local é experimental e não cria SSO. A FECAP ainda precisa autorizar o uso conectado antes de qualquer homologação institucional.</p> : null}
          {query.isPending ? <p role="status" className="mt-3 text-caption text-mist">Consultando o status da integração…</p> : null}
        </Surface>

        <Surface>
          <SectionHeader title="O que você encontra no portal oficial" />
          <p className="text-small leading-6 text-slate">A página oficial da FECAP informa que o Portal do Aluno oferece acesso a documentos, notas, faltas, boletos, vagas, quadro de horários e requerimentos. O login utiliza o Registro de Aluno.</p>
          <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4">
            <a href="https://www.fecap.br/asa/cesta-de-servicos/acesso-ao-portal-do-aluno/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-small font-semibold text-action hover:underline"><BookOpenCheck size={17} aria-hidden /> Instruções oficiais de acesso <ExternalLink size={14} aria-hidden /></a>
            <a href="mailto:sucessoalvarista@fecap.br?subject=Acesso%20ao%20Portal%20do%20Aluno" className="inline-flex items-center gap-2 text-small font-semibold text-action hover:underline"><CircleHelp size={17} aria-hidden /> Ajuda com o acesso ao portal</a>
          </div>
          <p className="mt-4 flex items-start gap-2 text-caption text-mist"><FileText size={15} className="mt-0.5 shrink-0" aria-hidden /> Ao abrir o link, você sai do ASA Conecta e autentica-se no ambiente da FECAP.</p>
        </Surface>
      </div>

      <Surface className="mt-5">
        <SectionHeader
          title="Leitura local do Portal"
          description="Executa o scraper no seu computador, usando o navegador local. O conteúdo fica na máquina e nesta sessão do navegador; não é enviado à API do ASA."
        />
        <div className="mb-4 flex items-start gap-3 rounded-md border border-line-soft bg-snow p-3 text-small text-slate">
          <ShieldCheck size={19} className="mt-0.5 shrink-0 text-action" aria-hidden />
          <p>A autenticação acontece no navegador do coletor. Nunca informe sua senha FECAP nesta tela. MFA e CAPTCHA são concluídos manualmente. A extração é somente leitura e os resultados expiram localmente após 60 minutos.</p>
        </div>

        {!collectorToken ? (
          <Button icon={LockKeyhole} disabled={tokenBusy} onClick={() => void createCollectorToken()}>
            {tokenBusy ? 'Preparando agente local…' : 'Preparar acesso ao agente local'}
          </Button>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-line bg-white p-3">
              <p className="text-small font-semibold text-ink">1. Configure o token no coletor deste computador</p>
              <p className="mt-1 text-caption text-slate">No diretório do coletor, instale as dependências e defina o token abaixo como <code>ASA_INTERNAL_SYNC_TOKEN</code> no `.env` local. Mantenha <code>FECAP_SYNC_ENABLED=false</code> e inclua a origem deste site em <code>ASA_LOCAL_ALLOWED_ORIGINS</code>.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input aria-label="Token de acesso local" readOnly value={collectorToken} className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-snow px-3 font-mono text-caption text-ink" />
                <Button size="sm" variant="secondary" onClick={() => void copyToken()}>Copiar token</Button>
              </div>
              <p className="mt-2 text-caption text-mist">O token fica apenas em memória nesta tela. Ao fechar ou recarregar, gere outro; isso revoga o anterior.</p>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-line bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-small font-semibold text-ink">2. Inicie o serviço local</p>
                <p className="mt-1 text-caption text-slate">No terminal, instale e inicie o coletor. O serviço escuta somente em 127.0.0.1:8765. Se ainda não existir, crie o `.env` copiando `.env.example` (PowerShell: <code>Copy-Item .env.example .env</code>; macOS/Linux: <code>cp -n .env.example .env</code>) e preserve configurações já existentes.</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-snow p-2 text-caption text-slate"><code>cd src/Entrega_2/Backend/fecap-collector{`\n`}python -m pip install -e .{`\n`}scrapling install{`\n`}fecap-portal serve</code></pre>
              </div>
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void checkLocalAgent()}>Permitir e verificar serviço local</Button>
            </div>

            {localPermissionMessage ? <p role="alert" className="text-small text-danger-text">{localPermissionMessage}</p> : null}
            {localStatus.isSuccess ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-green-200 bg-[#f2faf5] p-3">
                <div>
                  <p className="text-small font-semibold text-ink">Agente local disponível</p>
                  <p className="text-caption text-slate">{localStatus.data.authenticated ? `Sessão autenticada · ${localStatus.data.pagesVisited} páginas lidas` : 'Nenhuma sessão autenticada confirmada ainda.'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={['queued', 'running'].includes(localStatus.data.scan.status)} onClick={() => void startLocalScan()}>
                    {['queued', 'running'].includes(localStatus.data.scan.status) ? 'Leitura em andamento…' : 'Ler Portal agora'}
                  </Button>
                  {localStatus.data.authenticated && localStatus.data.scan.status === 'completed' ? <Button size="sm" variant="secondary" icon={Search} onClick={() => setDataVisible(true)}>Ver dados extraídos</Button> : null}
                </div>
              </div>
            ) : null}

            {localStatus.isError ? (
              <div className="rounded-md border border-line bg-snow p-3 text-small text-slate">
                <p className="font-semibold text-ink">Agente local não encontrado ou não autorizado.</p>
                <p className="mt-1">Confirme o `.env`, a origem permitida do site (<code>ASA_LOCAL_ALLOWED_ORIGINS</code>) e reinicie <code>fecap-portal serve</code>.</p>
              </div>
            ) : null}

            {localStatus.data?.scan.status === 'running' || localStatus.data?.scan.status === 'queued' ? (
              <p role="status" className="text-small text-action">Leitura em andamento. Conclua o login na janela do portal ou siga a confirmação solicitada no terminal local.</p>
            ) : null}

            {tokenMessage ? <p role="status" className="text-small text-slate">{tokenMessage}</p> : null}

            {dataVisible && localData.data ? (
              <section aria-label="Dados extraídos do Portal FECAP" className="border-t border-line-soft pt-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 className="text-h3 font-semibold text-ink">Leitura do Portal</h3><p className="text-caption text-mist">Fonte: sessão local confirmada · {localData.data.authenticatedAt ? new Date(localData.data.authenticatedAt).toLocaleString('pt-BR') : 'data indisponível'}</p></div>
                  <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); setSearchTerm(searchInput.trim()); }}>
                    <input aria-label="Pesquisar nos dados extraídos" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Pesquisar conteúdo" className="min-h-10 min-w-0 rounded-md border border-line bg-white px-3 text-small" />
                    <Button size="sm" variant="secondary" icon={Search}>Buscar</Button>
                  </form>
                </div>
                {localData.isFetching ? <p role="status" className="mb-3 text-caption text-mist">Atualizando a consulta local…</p> : null}
                {localData.data.records.length === 0 ? <p className="rounded-md bg-snow p-4 text-small text-slate">Nenhum conteúdo corresponde à busca. A extração pode não ter encontrado seções acessíveis nesta sessão.</p> : (
                  <div className="flex flex-col gap-3">
                    {localData.data.records.map((record) => (
                      <details key={record.id} className="rounded-md border border-line bg-white p-3" open={localData.data.records.length === 1}>
                        <summary className="cursor-pointer text-small font-semibold text-ink">{record.title} <span className="ml-1 font-normal text-mist">· {record.category}</span></summary>
                        <p className="mt-2 text-caption text-mist">Capturado em {new Date(record.capturedAt).toLocaleString('pt-BR')}</p>
                        {record.tables.map((table, tableIndex) => (
                          <div key={`${record.id}-table-${tableIndex}`} className="mt-3 overflow-x-auto">
                            <table className="min-w-full border-collapse text-left text-caption">
                              {table.headers.length ? <thead><tr>{table.headers.map((header, index) => <th key={`${header}-${index}`} className="border-b border-line bg-snow px-2 py-2 font-semibold text-ink">{header}</th>)}</tr></thead> : null}
                              <tbody>{table.rows.map((row, rowIndex) => <tr key={`${record.id}-${tableIndex}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}`} className="border-b border-line-soft px-2 py-2 text-slate">{cell}</td>)}</tr>)}</tbody>
                            </table>
                          </div>
                        ))}
                        {record.text ? <details className="mt-3"><summary className="cursor-pointer text-caption font-semibold text-action">Ver texto extraído</summary><p className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-snow p-3 text-small leading-6 text-slate">{record.text}</p></details> : null}
                      </details>
                    ))}
                    {localData.data.returned < localData.data.totalAvailable ? <p className="text-caption text-mist">Mostrando {localData.data.returned} de {localData.data.totalAvailable} seções capturadas. Refine a busca para localizar outras.</p> : null}
                  </div>
                )}
              </section>
            ) : null}
            {localData.isError ? <p role="alert" className="text-small text-danger-text">{localData.error instanceof Error ? localData.error.message : 'Não foi possível consultar a leitura local.'}</p> : null}
          </div>
        )}
        {tokenMessage && !collectorToken ? <p role="alert" className="mt-3 text-small text-danger-text">{tokenMessage}</p> : null}
      </Surface>
    </>
  );
}
