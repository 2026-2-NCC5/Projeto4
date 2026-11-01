import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Bell, BriefcaseBusiness, Building2, CalendarClock, Check, CheckCircle2, ClipboardCheck, FileUser, FolderGit2, GraduationCap, Languages, MapPin, Save, Sparkles, Target, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/Form';
import { Badge, Surface } from '@/components/ui/Display';
import { useCareerProfile, useUpdateCareerProfile, type CareerProfileInput } from '@/features/career/api';
import { academicApi } from '@/services/api/endpoints';
import { useQuery } from '@tanstack/react-query';

const STORAGE_KEY = 'asa-career-onboarding-v1';
const steps = [
  { title: 'Sua trajetória acadêmica', icon: GraduationCap, description: 'Seu momento na graduação ajuda a encontrar oportunidades adequadas à sua formação.' },
  { title: 'Seu próximo objetivo', icon: Target, description: 'Conte o que você gostaria de conquistar agora.' },
  { title: 'Áreas de atuação', icon: BriefcaseBusiness, description: 'Escolha as áreas profissionais que despertam seu interesse.' },
  { title: 'Competências', icon: Wrench, description: 'Conhecimentos que você desenvolveu na faculdade, em cursos ou por conta própria.' },
  { title: 'Experiências', icon: Building2, description: 'Trabalho, estágio e atividades práticas fazem parte da sua história.' },
  { title: 'Projetos e portfólio', icon: FolderGit2, description: 'Mostre projetos acadêmicos, pessoais, voluntários ou de extensão.' },
  { title: 'Currículo', icon: FileUser, description: 'Você pode seguir sem currículo e voltar a esta etapa depois.' },
  { title: 'Idiomas e formação complementar', icon: Languages, description: 'Idiomas, cursos e certificações que complementam seu perfil.' },
  { title: 'Sua disponibilidade', icon: CalendarClock, description: 'Indique quando e em qual modalidade uma oportunidade funciona para você.' },
  { title: 'Localização', icon: MapPin, description: 'Informe cidades e regiões de interesse. Não precisamos do seu endereço.' },
  { title: 'Preferências profissionais', icon: BriefcaseBusiness, description: 'Ajuste o tipo de oportunidade e de empresa que procura.' },
  { title: 'Revise seu perfil', icon: ClipboardCheck, description: 'Confira suas respostas antes de concluir.' },
];
const objectiveOptions = ['Conquistar meu primeiro estágio', 'Encontrar um novo estágio', 'Iniciar minha carreira', 'Encontrar uma vaga efetiva', 'Participar de trainee', 'Desenvolver competências', 'Explorar possibilidades'];
const areas = ['Desenvolvimento Front-end', 'Desenvolvimento Back-end', 'Inteligência Artificial', 'Ciência de Dados', 'Segurança da Informação', 'Produto Digital', 'UX/UI', 'Administração', 'Finanças', 'Contabilidade', 'Marketing', 'Recursos Humanos', 'Logística', 'Consultoria', 'Comércio Exterior', 'Comunicação'];
const modes = ['Presencial', 'Híbrido', 'Remoto'];
type Draft = { [key: string]: string | string[] | boolean };
const blank: Draft = { name: '', course: '', semester: '', period: '', graduation: '', objective: '', areas: [], skills: [], softSkills: [], experiences: '', projects: '', resumeName: '', languages: '', certificates: '', availability: [], city: '', state: '', regions: '', modalities: [], opportunityType: '', companyPreference: '', interests: '', completed: false };
const inputClass = 'mt-1 h-11 w-full rounded-md border border-line bg-white px-3 text-body text-ink outline-none transition focus:border-action focus:ring-2 focus:ring-action/20';

function readDraft(): Draft {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? { ...blank, ...JSON.parse(raw) as Draft } : blank; } catch { return blank; }
}
function split(value: string) { return value.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean); }
function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block text-small font-medium text-ink">{label}<input className={inputClass} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}
function MultiChoice({ values, options, onChange, label }: { values: string[]; options: string[]; onChange: (value: string[]) => void; label?: string }) {
  return <fieldset><legend className="mb-2 text-small font-medium text-ink">{label}</legend><div className="flex flex-wrap gap-2">{options.map((option) => {
    const active = values.includes(option);
    return <button key={option} type="button" aria-pressed={active} onClick={() => onChange(active ? values.filter((item) => item !== option) : [...values, option])} className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-small transition-colors ${active ? 'border-action bg-action-soft font-semibold text-action' : 'border-line bg-white text-slate hover:border-action/50 hover:bg-paper'}`}>{active ? <Check size={15} aria-hidden /> : null}{option}</button>;
  })}</div></fieldset>;
}
function TextArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block text-small font-medium text-ink">{label}<textarea className="mt-1 min-h-28 w-full rounded-md border border-line bg-white p-3 text-body text-ink outline-none transition focus:border-action focus:ring-2 focus:ring-action/20" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

export default function CareerOnboardingPage() {
  const navigate = useNavigate();
  const profile = useCareerProfile();
  const academicCatalog = useQuery({ queryKey: ['academic', 'catalog'], queryFn: academicApi.catalog, staleTime: 300_000 });
  const update = useUpdateCareerProfile();
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [step, setStep] = useState(0);
  const [splash, setSplash] = useState(() => !localStorage.getItem('asa-career-splash-seen'));
  const [savedLabel, setSavedLabel] = useState('Rascunho salvo neste dispositivo');
  const [error, setError] = useState('');
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); }, [draft]);
  useEffect(() => {
    if (!splash) return;
    const timer = window.setTimeout(() => { setSplash(false); localStorage.setItem('asa-career-splash-seen', '1'); }, 950);
    return () => window.clearTimeout(timer);
  }, [splash]);
  const completed = Boolean(draft.completed);
  const updateField = (key: string, value: string | string[] | boolean) => { setSavedLabel('Rascunho salvo neste dispositivo'); setDraft((current) => ({ ...current, [key]: value })); };
  const percent = Math.round(((step + 1) / steps.length) * 100);
  const toggleSplash = () => { setSplash(false); localStorage.setItem('asa-career-splash-seen', '1'); };
  const finish = async () => {
    setError(''); setSavedLabel('Salvando perfil…');
    const mapped: CareerProfileInput = {
      course: String(draft.course || '').trim() || profile.data?.course || null,
      semester: String(draft.semester || '').trim() ? Number(draft.semester) : profile.data?.semester ?? null,
      careerObjective: [String(draft.objective || profile.data?.careerObjective || ''), ...(draft.areas as string[])].filter(Boolean).join(' · '),
      firstInternship: draft.objective ? String(draft.objective).toLowerCase().includes('primeiro estágio') : profile.data?.firstInternship ?? false,
      skills: [...new Set([...(draft.skills as string[]), ...(draft.softSkills as string[]), ...((draft.skills as string[]).length || (draft.softSkills as string[]).length ? [] : profile.data?.skills ?? [])])],
      interests: [...new Set([...(draft.areas as string[]), ...split(String(draft.interests || '')), ...((draft.areas as string[]).length || draft.interests ? [] : profile.data?.interests ?? [])])],
      city: String(draft.city || '').trim() || profile.data?.city || null, state: String(draft.state || '').trim().toUpperCase() || profile.data?.state || null,
      modalities: (draft.modalities as string[]).length ? (draft.modalities as string[]).map((value) => value === 'Presencial' ? 'onsite' : value === 'Híbrido' ? 'hybrid' : 'remote') : profile.data?.modalities ?? [],
      availability: Object.keys(draft.availability as object).length ? { daysAndPeriods: draft.availability } : profile.data?.availability ?? {}, personalizationEnabled: profile.data?.personalizationEnabled ?? true,
    };
    try {
      await update.mutateAsync(mapped);
      setDraft((current) => ({ ...current, completed: true }));
      setSavedLabel('Perfil profissional salvo');
    } catch {
      setSavedLabel('Não foi possível salvar na plataforma');
      setError('Não foi possível salvar seu perfil na plataforma. Seu rascunho continua neste dispositivo; tente novamente quando sua conexão estiver disponível.');
    }
  };
  const resumeFile = (file?: File) => {
    if (!file) return;
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'];
    if (!allowed.includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Escolha um arquivo PDF ou DOCX de até 10 MB. O currículo não será enviado: o projeto ainda não possui serviço de upload.'); return; }
    updateField('resumeName', file.name);
    setError('O arquivo foi selecionado neste navegador, mas ainda não pode ser enviado ou analisado porque a API não oferece integração de currículo.');
  };
  const dataRows = useMemo<Array<[string, string]>>(() => [
    ['Formação', [String(draft.course || ''), draft.semester && `${draft.semester}º semestre`].filter(Boolean).join(' · ')], ['Objetivo', String(draft.objective || '')], ['Áreas', (draft.areas as string[]).join(', ')],
    ['Competências', [...draft.skills as string[], ...draft.softSkills as string[]].join(', ')], ['Experiências', String(draft.experiences || '')], ['Projetos', String(draft.projects || '')], ['Currículo', String(draft.resumeName || '')],
    ['Idiomas e cursos', [String(draft.languages || ''), String(draft.certificates || '')].filter(Boolean).join(' · ')], ['Disponibilidade', (draft.availability as string[]).join(', ')], ['Localização', [String(draft.city || ''), String(draft.state || ''), String(draft.regions || '')].filter(Boolean).join(' · ')],
    ['Preferências', [String(draft.opportunityType || ''), (draft.modalities as string[]).join(', '), String(draft.companyPreference || '')].filter(Boolean).join(' · ')],
  ], [draft]);

  if (splash) return <main className="grid min-h-[70vh] place-items-center bg-white px-5 text-center" style={{ colorScheme: 'light' }}><div className="asa-appear max-w-xl"><div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-action text-white"><Sparkles size={30} aria-hidden /></div><p className="text-caption font-bold uppercase tracking-[0.2em] text-action">ASA · FECAP</p><h1 className="mt-3 text-display font-bold text-ink">ASA Match</h1><p className="mt-2 text-body text-slate">Conectando seu talento às próximas oportunidades.</p><Button className="mt-6" onClick={toggleSplash}>Pular introdução</Button></div></main>;
  if (completed) return <main className="mx-auto max-w-3xl px-4 py-10 sm:py-16" style={{ colorScheme: 'light' }}><Surface className="text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-soft text-success-text"><CheckCircle2 size={34} aria-hidden /></span><h1 className="mt-5 text-h1 font-bold text-ink">Seu perfil profissional está pronto!</h1><p className="mx-auto mt-2 max-w-xl text-body text-slate">O ASA Match pode recomendar oportunidades usando os dados profissionais que você informou.</p><p className="mt-4 text-small text-mist">{savedLabel}. A API do ASA Match recebe formação, objetivo, competências, áreas, disponibilidade e localização.</p><div className="mt-6 flex flex-wrap justify-center gap-3"><Button variant="primary" onClick={() => navigate('/aluno/oportunidades')}>Ver oportunidades</Button><Button onClick={() => { setDraft((current) => ({ ...current, completed: false })); setStep(0); }}>Editar meu perfil</Button></div></Surface></main>;

  const stepContent = () => {
    switch (step) {
      case 0: {
        const courses = academicCatalog.data?.courses ?? [];
        const selectedCourse = courses.find((course) => course.name === String(draft.course || profile.data?.course || ''));
        const semesters = Array.from({ length: selectedCourse?.totalSemesters ?? 20 }, (_, index) => String(index + 1));
        const periods = selectedCourse?.periods ?? ['Matutino', 'Vespertino', 'Noturno'];
        return <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nome" value={String(draft.name)} onChange={(v) => updateField('name', v)} placeholder="Como gostaria de ser chamado(a)" />
          <SearchableSelect label="Curso" value={String(draft.course || profile.data?.course || '')} onChange={(value) => { updateField('course', value); updateField('semester', ''); updateField('period', ''); }} placeholder="Pesquise e selecione seu curso" searchPlaceholder="Buscar curso" emptyLabel={academicCatalog.isLoading ? 'Carregando cursos do GameFY...' : 'Catálogo acadêmico indisponível.'} options={courses.map((course) => ({ value: course.name, label: course.name, description: `${course.totalSemesters} semestres` }))} />
          <SearchableSelect label="Semestre atual" value={String(draft.semester || profile.data?.semester || '')} onChange={(value) => updateField('semester', value)} placeholder="Selecione o semestre" searchPlaceholder="Buscar semestre" options={semesters.map((semester) => ({ value: semester, label: `${semester}º semestre` }))} disabled={!selectedCourse} />
          <SearchableSelect label="Período acadêmico" value={String(draft.period)} onChange={(value) => updateField('period', value)} placeholder="Selecione o período" searchPlaceholder="Buscar período" options={periods.map((period) => ({ value: period, label: period }))} disabled={!selectedCourse} />
          <TextField label="Previsão de conclusão" value={String(draft.graduation)} onChange={(v) => updateField('graduation', v)} type="month" />
          <p className="sm:col-span-2 rounded-md bg-paper p-3 text-small text-slate">{academicCatalog.data ? `Catálogo sincronizado do GameFY em ${new Date(academicCatalog.data.updatedAt).toLocaleString('pt-BR')}. Curso e semestre informados por você não substituem o vínculo acadêmico oficial.` : 'Catálogo do GameFY indisponível no momento. Tente novamente mais tarde; não exibimos opções inventadas.'}</p>
        </div>;
      }
      case 1: return <MultiChoice label="Selecione seu objetivo principal" options={objectiveOptions} values={draft.objective ? [String(draft.objective)] : []} onChange={(v) => updateField('objective', v[0] || '')} />;
      case 2: return <><MultiChoice label="Você pode escolher mais de uma área" options={areas} values={draft.areas as string[]} onChange={(v) => updateField('areas', v)} /><TextField label="Outra área (opcional)" value={String(draft.otherArea || '')} onChange={(v) => updateField('otherArea', v)} placeholder="Digite uma área" /></>;
      case 3: return <div className="space-y-5"><TextArea label="Competências técnicas" value={(draft.skills as string[]).join(', ')} onChange={(v) => updateField('skills', split(v))} placeholder="Ex.: Excel, Python, SQL, Power BI" /><TextArea label="Competências comportamentais" value={(draft.softSkills as string[]).join(', ')} onChange={(v) => updateField('softSkills', split(v))} placeholder="Ex.: comunicação, organização, trabalho em equipe" /><p className="text-caption text-mist">A autoavaliação não equivale a certificação. Separe as habilidades com vírgula.</p></div>;
      case 4: return <><p className="mb-3 rounded-md bg-action-soft p-3 text-small text-action">Ainda não trabalhou? Sem problema. Projetos, cursos e conhecimentos também contam na sua trajetória.</p><TextArea label="Experiências profissionais ou atividades práticas" value={String(draft.experiences)} onChange={(v) => updateField('experiences', v)} placeholder="Empresa, cargo, período e atividades. Inclua voluntariado ou projetos aplicados se fizer sentido." /></>;
      case 5: return <><TextArea label="Projetos acadêmicos, pessoais, extensão ou voluntariado" value={String(draft.projects)} onChange={(v) => updateField('projects', v)} placeholder="Nome do projeto, seu papel, ferramentas utilizadas e link (se houver)." /><TextField label="LinkedIn, GitHub, Behance ou portfólio (opcional)" value={String(draft.links || '')} onChange={(v) => updateField('links', v)} placeholder="https://" /></>;
      case 6: return <div className="space-y-4"><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-paper p-5 text-center hover:border-action"><FileUser size={25} className="text-action" aria-hidden /><span className="mt-2 font-semibold text-ink">Selecionar currículo (PDF ou DOCX)</span><span className="mt-1 text-caption text-slate">Até 10 MB · seleção local, envio indisponível</span><input className="sr-only" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => resumeFile(event.target.files?.[0])} /></label>{draft.resumeName ? <p className="text-small text-slate">Selecionado: {String(draft.resumeName)}</p> : null}<p className="rounded-md bg-paper p-3 text-small text-slate">A API atual não oferece upload nem análise de currículo. Você pode seguir sem currículo e seu rascunho permanece salvo neste dispositivo.</p></div>;
      case 7: return <div className="grid gap-4 sm:grid-cols-2"><TextArea label="Idiomas e nível" value={String(draft.languages)} onChange={(v) => updateField('languages', v)} placeholder="Ex.: Inglês intermediário; Espanhol básico" /><TextArea label="Cursos e certificações" value={String(draft.certificates)} onChange={(v) => updateField('certificates', v)} placeholder="Nome do curso, instituição e link de comprovação (opcional)" /></div>;
      case 8: return <div className="space-y-5"><MultiChoice label="Dias e períodos disponíveis" options={['Seg manhã', 'Seg tarde', 'Seg noite', 'Ter manhã', 'Ter tarde', 'Ter noite', 'Qua manhã', 'Qua tarde', 'Qua noite', 'Qui manhã', 'Qui tarde', 'Qui noite', 'Sex manhã', 'Sex tarde', 'Sex noite']} values={draft.availability as string[]} onChange={(v) => updateField('availability', v)} /><MultiChoice label="Modalidades de trabalho" options={modes} values={draft.modalities as string[]} onChange={(v) => updateField('modalities', v)} /><TextField label="Carga horária desejada (opcional)" value={String(draft.workload || '')} onChange={(v) => updateField('workload', v)} placeholder="Ex.: 20 a 30 horas semanais" /></div>;
      case 9: return <div className="grid gap-4 sm:grid-cols-2"><TextField label="Cidade" value={String(draft.city)} onChange={(v) => updateField('city', v)} placeholder="Ex.: São Paulo" /><TextField label="Estado (UF)" value={String(draft.state)} onChange={(v) => updateField('state', v)} placeholder="SP" /><div className="sm:col-span-2"><TextArea label="Regiões de interesse (opcional)" value={String(draft.regions)} onChange={(v) => updateField('regions', v)} placeholder="Ex.: Osasco, Barueri, Carapicuíba" /></div><p className="sm:col-span-2 text-caption text-mist">Não solicitamos endereço residencial nem acessamos sua localização.</p></div>;
      case 10: return <div className="space-y-5"><MultiChoice label="Tipo de oportunidade" options={['Estágio', 'Trainee', 'Efetiva', 'Aprendiz', 'Programa de desenvolvimento']} values={draft.opportunityType ? [String(draft.opportunityType)] : []} onChange={(v) => updateField('opportunityType', v[0] || '')} /><TextField label="Preferência por segmento ou empresa (opcional)" value={String(draft.companyPreference)} onChange={(v) => updateField('companyPreference', v)} placeholder="Segmentos, empresas ou tipo de organização" /><TextField label="Interesses pessoais (opcional)" value={String(draft.interests)} onChange={(v) => updateField('interests', v)} placeholder="Somente se quiser compartilhar" /><p className="text-caption text-mist">A preferência por empresa não altera a compatibilidade das vagas. Parceiros institucionais ainda não estão conectados a esta experiência.</p></div>;
      default: return <div className="space-y-2">{dataRows.map(([label, value]) => <div key={label} className="grid gap-1 border-b border-line-soft py-3 sm:grid-cols-[10rem_1fr]"><span className="text-small font-semibold text-ink">{label}</span><span className="break-words text-small text-slate">{String(value || 'Não informado')}</span></div>)}<p className="mt-4 text-caption text-mist">Você poderá editar estas informações depois. A conclusão envia à API apenas os campos profissionais atualmente suportados.</p></div>;
    }
  };

  const currentStep = steps[step] ?? { title: 'Sua jornada profissional', description: '', icon: GraduationCap };
  const Icon = currentStep.icon;
  return <main className="mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-8" style={{ colorScheme: 'light' }}>
    <header className="mb-6 flex items-center justify-between gap-4"><Link to="/aluno/oportunidades" className="inline-flex items-center gap-2 text-small font-semibold text-action hover:underline"><ArrowLeft size={16} aria-hidden /> ASA Match</Link><div className="flex items-center gap-3"><span className="hidden text-caption text-mist sm:inline-flex sm:items-center sm:gap-1"><Save size={14} aria-hidden />{savedLabel}</span><Link to="/aluno/notificacoes" aria-label="Central de notificações" className="grid h-10 w-10 place-items-center rounded-md text-slate hover:bg-paper"><Bell size={19} aria-hidden /></Link></div></header>
    <div className="mb-5 rounded-lg border border-line bg-white p-4 sm:p-5"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-small font-semibold text-ink">Minha Jornada Profissional</span><span className="text-caption text-slate">Etapa {step + 1} de 12 · {percent}%</span></div><div className="h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-action transition-[width] duration-300" style={{ width: `${percent}%` }} /></div><div className="mt-3 hidden grid-cols-5 gap-2 md:grid">{['Conhecer', 'Construir', 'Conectar', 'Recomendar', 'Evoluir'].map((item, index) => <span key={item} className={`text-caption ${index <= Math.floor(step / 2.4) ? 'font-semibold text-action' : 'text-mist'}`}>{item}</span>)}</div></div>
    <Surface className="asa-appear p-5 sm:p-8" aria-live="polite"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-lg bg-action-soft text-action"><Icon size={23} aria-hidden /></div><Badge tone="action">Etapa {step + 1}</Badge><h1 className="mt-3 text-h1 font-bold text-ink">{currentStep.title}</h1><p className="mt-1 mb-6 max-w-2xl text-body text-slate">{currentStep.description}</p>{stepContent()}
      {error ? <p role="alert" className="mt-4 rounded-md border border-warning bg-warning-soft p-3 text-small text-warning-text">{error}</p> : null}
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><Button disabled={step === 0 || update.isPending} onClick={() => { setError(''); setStep((value) => Math.max(0, value - 1)); }} icon={ArrowLeft}>Voltar</Button><div className="ml-auto flex items-center gap-2"><button type="button" className="rounded-md px-3 py-2 text-small font-medium text-slate hover:bg-paper" onClick={() => { setSavedLabel('Rascunho salvo neste dispositivo'); navigate('/aluno/oportunidades'); }}>Salvar e sair</button>{step < 11 ? <Button variant="primary" iconRight={ArrowRight} onClick={() => { setError(''); setStep((value) => Math.min(11, value + 1)); }}>Continuar</Button> : <Button variant="primary" icon={Check} loading={update.isPending} onClick={() => void finish()}>Finalizar e encontrar oportunidades</Button>}</div></footer>
    </Surface><p className="mt-3 text-center text-caption text-mist">Preencher é opcional e você pode continuar sem experiência profissional. {savedLabel}</p>
  </main>;
}
