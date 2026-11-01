import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BriefcaseBusiness, ExternalLink, MapPin, Search, Sparkles, Star, UserRound, X } from 'lucide-react';
import { Badge, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, LoadingRows } from '@/components/feedback/States';
import { careerApi, careerKeys, useCareerAlerts, useCareerApplications, useCareerJobs, useCareerProfile, useCareerRecommendations, useCareerSaved, useSaveCareerJob, useUpdateCareerProfile, type CareerProfile, type CareerProfileInput, type JobOpportunity } from '@/features/career/api';
import { messageForError } from '@/services/api/client';

type Tab = 'recommended'|'explore'|'nearby'|'saved'|'applications'|'profile'|'alerts';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'recommended', label: 'Recomendadas' }, { id: 'explore', label: 'Explorar vagas' }, { id: 'nearby', label: 'Na sua região' }, { id: 'saved', label: 'Salvas' },
  { id: 'applications', label: 'Minhas candidaturas' }, { id: 'profile', label: 'Meu perfil' }, { id: 'alerts', label: 'Alertas' },
];
const MODE: Record<string,string> = { onsite: 'Presencial', hybrid: 'Híbrido', remote: 'Remoto', unknown: 'Modalidade não informada' };
const TYPE: Record<string,string> = { internship: 'Estágio', trainee: 'Trainee', apprentice: 'Jovem aprendiz', employment: 'Emprego', program: 'Programa' };
const EMPTY_PROFILE: CareerProfile = { id:null,course:null,academicDataVerified:false,semester:null,careerObjective:'',firstInternship:false,skills:[],interests:[],city:null,state:null,region:null,preferredRadiusKm:null,modalities:[],availability:{},personalizationEnabled:true };

function profileFormValue(initial: CareerProfile) {
  return {
    course: initial.course ?? '', semester: initial.semester?.toString() ?? '', careerObjective: initial.careerObjective ?? '', firstInternship: initial.firstInternship ?? false,
    skills: (initial.skills ?? []).join(', '), interests: (initial.interests ?? []).join(', '), city: initial.city ?? '', state: initial.state ?? '',
    preferredRadiusKm: initial.preferredRadiusKm?.toString() ?? '', modalities: initial.modalities ?? [], personalizationEnabled: initial.personalizationEnabled ?? true,
  };
}

function formatMoney(value: number | null) { return value === null ? 'Bolsa não informada' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value); }
function dateLabel(value: string | null) { return value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value)) : 'Data não informada'; }

function JobCard({ job, saved, onSave, onOpen, onInterest }: { job: JobOpportunity; saved: boolean; onSave: () => void; onOpen: () => void; onInterest: (feedback: 'interested'|'not_interested') => void }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4 sm:p-5" aria-label={`${job.title} na ${job.companyName}`}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{TYPE[job.jobType] ?? 'Oportunidade'}</Badge>
            {job.match ? <Badge tone={job.match.score >= 75 ? 'success' : 'action'}>{job.match.score}% de afinidade</Badge> : null}
            {job.match?.eligibility === 'unverified' ? <Badge tone="warning">Elegibilidade não confirmada</Badge> : null}
          </div>
          <button onClick={onOpen} className="mt-3 text-left text-h3 font-semibold text-ink hover:text-action focus-visible:outline focus-visible:outline-2 focus-visible:outline-action">{job.title}</button>
          <p className="mt-1 text-body font-medium text-slate">{job.companyName}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-small text-slate">
            <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden />{[job.city, job.state].filter(Boolean).join(' / ') || 'Local não informado'}</span>
            <span>{MODE[job.workMode] ?? MODE.unknown}</span><span>{formatMoney(job.stipendMin)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" aria-label={saved ? `Remover ${job.title} das salvas` : `Salvar ${job.title}`} icon={saved ? Star : undefined} onClick={onSave}>{saved ? 'Salva' : 'Salvar vaga'}</Button>
          <Button size="sm" variant="primary" onClick={onOpen}>Ver detalhes</Button>
        </div>
      </div>
      {job.match ? <div className="mt-4 border-t border-line-soft pt-3">
        <p className="text-small font-semibold text-ink">Por que recomendamos</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-small text-slate">{job.match.reasons.slice(0,2).map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {job.match.warnings.length ? <p className="mt-2 text-caption text-slate">{job.match.warnings[0]}</p> : null}
      </div> : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-caption text-mist">
        <span>Fonte: {job.sourceName} · verificada em {dateLabel(job.lastVerifiedAt)}</span>
        <button className="font-medium text-action underline-offset-2 hover:underline" onClick={() => onInterest('not_interested')}>Não tenho interesse</button>
      </div>
    </article>
  );
}

function ProfileForm({ initial, onSaved, saving }: { initial: CareerProfile; onSaved: (value: CareerProfileInput) => void; saving: boolean }) {
  const [form, setForm] = useState(() => profileFormValue(initial));
  const [previousInitial, setPreviousInitial] = useState(initial);
  if (initial !== previousInitial) {
    setPreviousInitial(initial);
    setForm(profileFormValue(initial));
  }
  const change = (key: keyof typeof form, value: string | boolean | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleMode = (mode: 'onsite'|'hybrid'|'remote') => change('modalities', form.modalities.includes(mode) ? form.modalities.filter((item) => item !== mode) : [...form.modalities, mode]);
  const submit = () => onSaved({
    course: form.course.trim() || null, semester: form.semester ? Number(form.semester) : null, careerObjective: form.careerObjective,
    firstInternship: form.firstInternship, skills: form.skills.split(',').map((v) => v.trim()).filter(Boolean), interests: form.interests.split(',').map((v) => v.trim()).filter(Boolean),
    city: form.city.trim() || null, state: form.state.trim().toUpperCase() || null, preferredRadiusKm: form.preferredRadiusKm ? Number(form.preferredRadiusKm) : null,
    modalities: form.modalities as Array<'onsite'|'hybrid'|'remote'>, personalizationEnabled: form.personalizationEnabled,
  });
  const inputClass = 'mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-body text-ink outline-none focus:border-action focus:ring-2 focus:ring-action/20';
  return (
    <Surface>
      <SectionHeader title="Perfil profissional" description="Preencha apenas o que desejar. Não é necessário ter experiência para buscar o primeiro estágio." />
      <p className="mt-3 rounded-md bg-snow px-3 py-2 text-caption text-slate">{initial.academicDataVerified ? 'Dados acadêmicos confirmados por integração institucional.' : 'Curso e semestre são informados no ASA Match e ainda não foram verificados por integração institucional.'}</p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-small font-medium text-ink">Curso<input className={inputClass} maxLength={160} value={form.course} onChange={(e) => change('course',e.target.value)} placeholder="Ex.: Ciência da Computação" /></label>
        <label className="text-small font-medium text-ink">Semestre atual<input className={inputClass} type="number" min={1} max={20} value={form.semester} onChange={(e) => change('semester',e.target.value)} /></label>
        <label className="text-small font-medium text-ink md:col-span-2">Objetivo profissional<textarea className="mt-1 min-h-24 w-full rounded-md border border-line bg-white p-3 text-body text-ink outline-none focus:border-action focus:ring-2 focus:ring-action/20" maxLength={2000} value={form.careerObjective} onChange={(e) => change('careerObjective',e.target.value)} placeholder="Áreas ou experiências que gostaria de explorar" /></label>
        <label className="text-small font-medium text-ink md:col-span-2">Competências e ferramentas, separadas por vírgula<input className={inputClass} value={form.skills} onChange={(e) => change('skills',e.target.value)} placeholder="Ex.: JavaScript, React, SQL" /></label>
        <label className="text-small font-medium text-ink md:col-span-2">Áreas de interesse, separadas por vírgula<input className={inputClass} value={form.interests} onChange={(e) => change('interests',e.target.value)} placeholder="Ex.: Desenvolvimento Web, Dados, Finanças" /></label>
        <label className="text-small font-medium text-ink">Cidade<input className={inputClass} maxLength={120} value={form.city} onChange={(e) => change('city',e.target.value)} /></label>
        <label className="text-small font-medium text-ink">Estado (UF)<input className={inputClass} maxLength={2} value={form.state} onChange={(e) => change('state',e.target.value)} placeholder="SP" /></label>
        <label className="text-small font-medium text-ink">Raio desejado (km)<input className={inputClass} type="number" min={0} max={500} value={form.preferredRadiusKm} onChange={(e) => change('preferredRadiusKm',e.target.value)} placeholder="Opcional" /></label>
        <fieldset className="text-small font-medium text-ink"><legend>Modalidades preferidas</legend><div className="mt-2 flex flex-wrap gap-3">{(['onsite','hybrid','remote'] as const).map((mode) => <label key={mode} className="flex items-center gap-2 font-normal"><input type="checkbox" checked={form.modalities.includes(mode)} onChange={() => toggleMode(mode)} />{MODE[mode]}</label>)}</div></fieldset>
        <label className="flex items-start gap-2 text-small text-ink md:col-span-2"><input className="mt-1" type="checkbox" checked={form.firstInternship} onChange={(e) => change('firstInternship',e.target.checked)} /><span>Estou procurando meu primeiro estágio.</span></label>
        <label className="flex items-start gap-2 text-small text-ink md:col-span-2"><input className="mt-1" type="checkbox" checked={form.personalizationEnabled} onChange={(e) => change('personalizationEnabled',e.target.checked)} /><span>Usar meu perfil para personalizar recomendações. Você poderá desativar isso e continuar usando a busca convencional.</span></label>
        <div className="md:col-span-2"><Button variant="primary" loading={saving} onClick={submit}>Salvar perfil</Button></div>
      </div>
    </Surface>
  );
}

function JobDetails({ job, onClose, onSave, saved }: { job: JobOpportunity; onClose: () => void; onSave: () => void; saved: boolean }) {
  return <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="job-detail-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-white p-5 shadow-lg sm:rounded-xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-caption font-semibold uppercase tracking-wide text-action">{TYPE[job.jobType] ?? 'Oportunidade'} · {job.sourceName}</p><h2 id="job-detail-title" className="mt-1 text-h2 font-semibold text-ink">{job.title}</h2><p className="mt-1 text-body text-slate">{job.companyName}</p></div><button aria-label="Fechar detalhes" className="rounded-md p-2 text-slate hover:bg-snow" onClick={onClose}><X size={20} /></button></div>
      <div className="mt-5 flex flex-wrap gap-2"><Badge tone="neutral">{MODE[job.workMode]}</Badge><Badge tone="neutral">{[job.city,job.state].filter(Boolean).join(' / ') || 'Local não informado'}</Badge><Badge tone="neutral">{formatMoney(job.stipendMin)}</Badge><Badge tone="neutral">Publicada: {dateLabel(job.publishedAt)}</Badge></div>
      {job.match ? <Surface className="mt-5 bg-green-50/60"><h3 className="font-semibold text-ink">Por que recomendamos esta vaga? <span className="text-action">{job.match.score}%</span></h3><p className="mt-1 text-caption text-slate">Afinidade com os critérios disponíveis, não é previsão de contratação. Cobertura da avaliação: {Math.round(job.match.confidence*100)}%.</p><ul className="mt-3 list-disc space-y-1 pl-5 text-small text-slate">{[...job.match.reasons,...job.match.warnings].map((item) => <li key={item}>{item}</li>)}</ul></Surface> : null}
      <div className="mt-5"><h3 className="font-semibold text-ink">Descrição</h3><p className="mt-2 whitespace-pre-wrap text-small leading-6 text-slate">{job.description || 'A fonte não publicou uma descrição detalhada.'}</p></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><h3 className="font-semibold text-ink">Competências informadas</h3><p className="mt-1 text-small text-slate">{[...job.requiredSkills,...job.desiredSkills].join(', ') || 'Não informadas pela fonte.'}</p></div><div><h3 className="font-semibold text-ink">Requisitos acadêmicos</h3><p className="mt-1 text-small text-slate">{job.acceptedCourses.join(', ') || 'Curso não especificado'}{job.minSemester ? ` · a partir do ${job.minSemester}º semestre` : ''}{job.maxSemester ? ` · até o ${job.maxSemester}º semestre` : ''}</p></div></div>
      <p className="mt-5 text-caption text-mist">Última confirmação na fonte: {dateLabel(job.lastVerifiedAt)}. A candidatura é feita no site oficial da empresa; o ASA Match não envia candidatura automaticamente.</p>
      <div className="mt-5 flex flex-wrap gap-2"><Button variant="primary" icon={ExternalLink} onClick={() => window.open(job.canonicalUrl, '_blank', 'noopener,noreferrer')}>Abrir candidatura oficial</Button><Button onClick={onSave}>{saved ? 'Remover das salvas' : 'Salvar vaga'}</Button></div>
    </section>
  </div>;
}

export default function CareerMatchPage() {
  const [tab,setTab] = useState<Tab>('recommended');
  const [selected,setSelected] = useState<JobOpportunity|null>(null);
  const [search,setSearch] = useState('');
  const [mode,setMode] = useState('');
  const [type,setType] = useState('internship');
  const [cityFilter,setCityFilter] = useState('');
  const [stateFilter,setStateFilter] = useState('');
  const client = useQueryClient();
  const profile = useCareerProfile();
  const recommendations = useCareerRecommendations();
  const jobs = useCareerJobs({ search, workMode: mode || undefined, type: type || undefined, city: tab==='nearby' ? profile.data?.city ?? undefined : cityFilter || undefined, state: tab==='nearby' ? profile.data?.state ?? undefined : stateFilter || undefined, limit: 50 });
  const saved = useCareerSaved();
  const applications = useCareerApplications();
  const alerts = useCareerAlerts();
  const careerNotifications = useQuery({ queryKey: careerKeys.notifications, queryFn: careerApi.notifications, enabled: tab === 'alerts' });
  const saveMutation = useSaveCareerJob();
  const profileMutation = useUpdateCareerProfile();
  const [feedbackMessage,setFeedbackMessage] = useState('');
  const savedIds = useMemo(() => new Set(saved.data?.map((item) => item.id) ?? []), [saved.data]);

  const toggleSaved = (job: JobOpportunity) => saveMutation.mutate({ id: job.id, saved: savedIds.has(job.id) });
  const feedback = async (job: JobOpportunity, value: 'interested'|'not_interested') => {
    try { await careerApi.feedback(job.id,value); setFeedbackMessage(value === 'not_interested' ? 'Preferência registrada.' : 'Interesse registrado.'); await client.invalidateQueries({ queryKey: careerKeys.all }); }
    catch (error) { setFeedbackMessage(messageForError(error)); }
  };
  const saveProfile = (input: CareerProfileInput) => profileMutation.mutate(input, { onSuccess: () => { setTab('recommended'); setFeedbackMessage('Perfil salvo. Recomendações atualizadas.'); }, onError: (error) => setFeedbackMessage(messageForError(error)) });
  const list = tab === 'recommended' ? recommendations.data?.items ?? [] : tab === 'saved' ? saved.data ?? [] : tab === 'applications' ? applications.data ?? [] : jobs.data?.items ?? [];
  const pageError = profile.error || recommendations.error || jobs.error || saved.error;

  return <div className="min-h-full bg-[#f7faf8] text-ink" style={{ colorScheme: 'light' }}>
    <PageHeader eyebrow="ASA Match" title="Seu próximo estágio pode estar aqui." description="Explore oportunidades e entenda como elas se relacionam com seus interesses. A compatibilidade é uma afinidade, não uma previsão de contratação." actions={<><ButtonLink to="/aluno/jornada-profissional" variant="primary">Minha Jornada Profissional</ButtonLink><a className="inline-flex items-center gap-2 text-small font-semibold text-action hover:underline" href="https://www.fecap.br/asa/cesta-de-servicos/s/empregabilidade-carreira/" target="_blank" rel="noreferrer">FECAP+ Oportunidades <ExternalLink size={15} aria-hidden /></a></>} />
    <div className="mb-5 rounded-lg border border-green-100 bg-white px-4 py-3 text-small text-slate"><strong className="text-ink">Camada complementar do FECAP+.</strong> O ASA Match organiza vagas de fontes autorizadas e mantém o link para os serviços oficiais de carreira, currículo, mentoria e gestão de estágio.</div>
    {feedbackMessage ? <div role="status" className="mb-4 rounded-md border border-line bg-white px-3 py-2 text-small text-slate">{feedbackMessage}<button className="ml-2 font-semibold text-action" onClick={() => setFeedbackMessage('')}>Fechar</button></div> : null}
    {pageError ? <div role="alert" className="mb-4 rounded-md border border-warning bg-white p-3 text-small text-slate">Não foi possível carregar todos os dados do ASA Match. Tente novamente ou consulte o FECAP+ pelo link oficial.</div> : null}
    <div role="tablist" aria-label="Seções do ASA Match" className="mb-5 flex gap-2 overflow-x-auto border-b border-line pb-2">{TABS.map((item) => <button key={item.id} role="tab" aria-selected={tab===item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-md px-3 py-2 text-small font-medium ${tab===item.id?'bg-white text-action shadow-sm':'text-slate hover:bg-white'}`}>{item.label}</button>)}</div>

    {tab === 'profile' ? <ProfileForm initial={profile.data ?? EMPTY_PROFILE} onSaved={saveProfile} saving={profileMutation.isPending} /> : null}

    {tab === 'alerts' ? <div className="flex flex-col gap-4"><AlertPanel preferences={alerts.data} saving={alerts.isPending} onSaved={async (value) => { try { await careerApi.updateAlerts(value); await client.invalidateQueries({ queryKey: careerKeys.alerts }); setFeedbackMessage('Preferências de alertas salvas. Alertas internos do ASA Match estão habilitados.'); } catch (error) { setFeedbackMessage(messageForError(error)); } }} /><Surface><SectionHeader title="Novas oportunidades" description="Alertas internos gerados para vagas que atingem sua afinidade mínima. Resumos são agrupados conforme a frequência escolhida." />{careerNotifications.isPending?<LoadingRows rows={2}/>:careerNotifications.data?.length?<ul className="mt-3 divide-y divide-line">{careerNotifications.data.map((item)=><li key={item.notificationId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-semibold text-ink">{item.title} · {item.companyName}</p><p className="text-caption text-slate">Vaga adicionada em {dateLabel(item.notifiedAt ?? null)} · {item.readAt?'Lida':'Não lida'}</p></div><div className="flex gap-2"><button className="text-small font-semibold text-action hover:underline" onClick={()=>setSelected(item)}>Ver vaga</button>{!item.readAt&&item.notificationId?<button className="text-small text-slate underline" onClick={async()=>{await careerApi.markNotificationRead(item.notificationId!);await client.invalidateQueries({queryKey:careerKeys.notifications});}}>Marcar como lida</button>:null}</div></li>)}</ul>:<p className="mt-3 text-small text-slate">Nenhum alerta de vaga por enquanto. Você receberá avisos internos quando uma nova oportunidade atingir seus critérios.</p>}</Surface></div> : null}

    {tab !== 'profile' && tab !== 'alerts' ? <>
      {tab === 'recommended' ? <div className="mb-5 grid gap-3 sm:grid-cols-3"><Metric label="Perfil" value={profile.data?.id ? 'Configurado' : 'Comece por aqui'} hint={profile.data?.course ?? 'Adicione interesses para personalizar'} icon={<UserRound size={19}/>} /><Metric label="Vagas recomendadas" value={String(recommendations.data?.items.length ?? 0)} hint="Somente oportunidades cadastradas por fonte" icon={<Sparkles size={19}/>} /><Metric label="Vagas salvas" value={String(saved.data?.length ?? 0)} hint="Acompanhe para revisar depois" icon={<Star size={19}/>} /></div> : null}
      {tab === 'explore' || tab === 'nearby' ? <Surface className="mb-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><label className="relative sm:col-span-2 lg:col-span-1"><span className="sr-only">Buscar vaga, empresa ou área</span><Search size={18} className="absolute left-3 top-3 text-mist" aria-hidden /><input className="h-11 w-full rounded-md border border-line bg-white pl-10 pr-3 text-body text-ink" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Vaga, empresa ou área" /></label><label><span className="sr-only">Cidade</span><input className="h-11 w-full rounded-md border border-line bg-white px-3 text-body text-ink" value={tab==='nearby' ? profile.data?.city ?? '' : cityFilter} onChange={(e)=>tab==='nearby'?undefined:setCityFilter(e.target.value)} readOnly={tab==='nearby'} placeholder="Cidade" /></label><label><span className="sr-only">Estado</span><input className="h-11 w-full rounded-md border border-line bg-white px-3 text-body text-ink" maxLength={2} value={tab==='nearby' ? profile.data?.state ?? '' : stateFilter} onChange={(e)=>tab==='nearby'?undefined:setStateFilter(e.target.value.toUpperCase())} readOnly={tab==='nearby'} placeholder="UF" /></label><label className="text-caption text-slate"><span className="sr-only">Modalidade</span><select className="h-11 w-full rounded-md border border-line bg-white px-3 text-body text-ink" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Todas as modalidades</option><option value="onsite">Presencial</option><option value="hybrid">Híbrido</option><option value="remote">Remoto</option></select></label><label className="text-caption text-slate"><span className="sr-only">Tipo</span><select className="h-11 w-full rounded-md border border-line bg-white px-3 text-body text-ink" value={type} onChange={(e) => setType(e.target.value)}><option value="internship">Estágio</option><option value="trainee">Trainee</option><option value="apprentice">Jovem aprendiz</option><option value="employment">Emprego</option><option value="">Todas</option></select></label></div>{tab==='nearby'?<p className="mt-3 text-caption text-slate">Filtro por cidade e UF exatas. A plataforma ainda não calcula raio ou tempo de deslocamento; não usa GPS.</p>:null}</Surface> : null}
      {tab === 'applications' ? <Surface className="mb-4"><p className="text-small text-slate">Este histórico é atualizado por você. Abrir uma candidatura externa não altera automaticamente o status. Para vagas salvas, use o menu de status no card.</p></Surface> : null}
      {tab === 'recommended' && recommendations.isPending || (tab === 'explore'||tab==='nearby') && jobs.isPending || tab === 'saved' && saved.isPending || tab === 'applications' && applications.isPending ? <LoadingRows rows={3} /> : list.length ? <div className="flex flex-col gap-3">{list.map((job) => <div key={job.id} className="space-y-2"><JobCard job={job} saved={savedIds.has(job.id)} onSave={() => toggleSaved(job)} onOpen={() => setSelected(job)} onInterest={(value) => void feedback(job,value)} />{tab === 'applications' ? <ApplicationStatus id={job.id} current={job.applicationStatus ?? 'interested'} onSaved={async (status) => { await careerApi.setApplication(job.id,status); await client.invalidateQueries({ queryKey: careerKeys.applications }); }} /> : null}</div>)}</div> : <EmptyState icon={BriefcaseBusiness} title={tab==='saved'?'Nenhuma vaga salva':tab==='applications'?'Nenhuma candidatura acompanhada':'Nenhuma oportunidade encontrada'} description={tab==='recommended'?'Ainda não há vagas de fontes autorizadas no catálogo. Você pode completar seu perfil e consultar o FECAP+ Oportunidades enquanto fontes do ASA Match são configuradas.':tab==='explore'||tab==='nearby'?'O catálogo está vazio para esses filtros. O ASA Match não exibe vagas fictícias; consulte o FECAP+ Oportunidades para ver as oportunidades oficiais da FECAP.':'Salve oportunidades para acompanhá-las nesta área.'} action={<a className="font-semibold text-action hover:underline" href="https://www.fecap.br/asa/cesta-de-servicos/s/empregabilidade-carreira/" target="_blank" rel="noreferrer">Acessar Empregabilidade &amp; Carreira da FECAP</a>} />}
    </> : null}
    {selected ? <JobDetails job={selected} onClose={() => setSelected(null)} saved={savedIds.has(selected.id)} onSave={() => toggleSaved(selected)} /> : null}
  </div>;
}

function Metric({ label,value,hint,icon }: { label:string;value:string;hint:string;icon:ReactNode }) { return <Surface className="flex items-start gap-3"><span className="rounded-lg bg-green-50 p-2 text-fecap">{icon}</span><div><p className="text-caption text-mist">{label}</p><p className="text-h3 font-semibold text-ink">{value}</p><p className="text-caption text-slate">{hint}</p></div></Surface>; }

function ApplicationStatus({ id,current,onSaved }: { id:string;current:string;onSaved:(status:string)=>Promise<void> }) {
  return <div className="flex items-center gap-2 pl-2 text-small text-slate"><label htmlFor={`application-${id}`}>Acompanhamento manual:</label><select id={`application-${id}`} className="h-9 rounded-md border border-line bg-white px-2 text-small text-ink" value={current} onChange={(e) => void onSaved(e.target.value)}><option value="interested">Tenho interesse</option><option value="plan_to_apply">Pretendo me candidatar</option><option value="applied">Candidatei-me</option><option value="interview">Entrevista</option><option value="offer">Recebi proposta</option><option value="closed">Encerrada</option><option value="not_selected">Não selecionado</option></select></div>;
}

function AlertPanel({ preferences, saving, onSaved }: { preferences?: { enabled:boolean;minimumMatchScore:number;frequency:'immediate'|'daily'|'weekly'|'off';channels:Array<'in_app'> }; saving:boolean; onSaved:(value:{enabled:boolean;minimumMatchScore:number;frequency:'immediate'|'daily'|'weekly'|'off';channels:Array<'in_app'>})=>void }) {
  const [enabled,setEnabled] = useState(preferences?.enabled ?? false); const [score,setScore] = useState(preferences?.minimumMatchScore ?? 70); const [frequency,setFrequency] = useState(preferences?.frequency ?? 'weekly');
  const [previousPreferences, setPreviousPreferences] = useState(preferences);
  if (preferences && preferences !== previousPreferences) {
    setPreviousPreferences(preferences);
    setEnabled(preferences.enabled);
    setScore(preferences.minimumMatchScore);
    setFrequency(preferences.frequency);
  }
  return <Surface><SectionHeader title="Alertas de oportunidades" description="Alertas no ASA Match. E-mail e push só serão oferecidos quando houver um provedor institucional configurado." /><div className="mt-5 flex flex-col gap-4"><label className="flex items-center gap-2 text-small text-ink"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />Ativar alertas quando houver oportunidades disponíveis</label><label className="max-w-sm text-small text-ink">Afinidade mínima: {score}%<input className="mt-2 w-full accent-action" type="range" min={0} max={100} step={5} value={score} onChange={(e) => setScore(Number(e.target.value))} /></label><label className="max-w-sm text-small text-ink">Frequência<select className="mt-1 h-10 w-full rounded-md border border-line bg-white px-3 text-body text-ink" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}><option value="immediate">Imediatamente</option><option value="daily">Resumo diário</option><option value="weekly">Resumo semanal</option><option value="off">Desativado</option></select></label><Button variant="primary" disabled={saving} onClick={() => onSaved({ enabled,minimumMatchScore:score,frequency,channels:enabled?['in_app']:[] })}>Salvar alertas</Button></div></Surface>;
}
