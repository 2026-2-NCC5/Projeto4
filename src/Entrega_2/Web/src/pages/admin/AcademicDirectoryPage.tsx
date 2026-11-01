import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, Users } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/Form';
import { Badge, PageHeader, SectionHeader, Surface } from '@/components/ui/Display';
import { academicApi } from '@/services/api/endpoints';
import type { AcademicDirectoryPerson } from '@/types/api';

export default function AcademicDirectoryPage() {
  const [kind, setKind] = useState<'student' | 'professor'>('student');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [personId, setPersonId] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<AcademicDirectoryPerson | null>(null);
  const [courseId, setCourseId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const catalog = useQuery({ queryKey: ['academic', 'catalog'], queryFn: academicApi.catalog, staleTime: 300_000 });
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const directory = useQuery({ queryKey: ['gamefy', 'directory', kind, debouncedSearch], queryFn: () => academicApi.searchDirectory(kind, debouncedSearch), enabled: debouncedSearch.length >= 2, staleTime: 60_000 });
  const courses = catalog.data?.courses ?? [];
  const subjects = useMemo(() => (catalog.data?.subjects ?? []).filter((item) => !courseId || item.courseId === courseId), [catalog.data?.subjects, courseId]);
  const classes = useMemo(() => (catalog.data?.classes ?? []).filter((item) => !courseId || item.courseId === courseId), [catalog.data?.classes, courseId]);
  const directoryOptions = useMemo(() => {
    const records = directory.data?.items ?? [];
    const selected = selectedPerson && selectedPerson.id === personId ? [selectedPerson] : [];
    return [...new Map([...selected, ...records].map((item) => [item.id, item])).values()].map((item) => ({
      value: item.id,
      label: item.name,
      description: kind === 'student'
        ? [item.course, item.semester ? `${item.semester}º semestre` : null, item.period, item.classCode ? `Turma ${item.classCode}` : null].filter(Boolean).join(' · ')
        : item.department || 'Professor(a) da FECAP',
    }));
  }, [directory.data?.items, kind, personId, selectedPerson]);
  const currentPerson = directory.data?.items.find((person) => person.id === personId) ?? selectedPerson;
  const selectedCourse = courses.find((course) => course.id === courseId);
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const selectedTerm = catalog.data?.terms.find((term) => term.id === termId);
  const selectedClass = classes.find((item) => item.id === classId);

  return <div>
    <PageHeader eyebrow="Dados acadêmicos conectados ao GameFY" title="Diretório acadêmico" description="Consulte estudantes, professores e a estrutura real de cursos, disciplinas, períodos e turmas da FECAP." />
    <Surface className="mb-5">
      <SectionHeader title="Pesquisar pessoa" description="A busca de pessoas fica disponível somente para contas autorizadas da equipe e administração. Digite ao menos 2 caracteres." />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Tipo de cadastro">
        {(['student', 'professor'] as const).map((option) => <button key={option} type="button" aria-pressed={kind === option} onClick={() => { setKind(option); setSearch(''); setDebouncedSearch(''); setPersonId(''); setSelectedPerson(null); }} className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-small font-semibold ${kind === option ? 'border-action bg-action-soft text-action' : 'border-line bg-white text-slate hover:border-action/50'}`}>
          {option === 'student' ? <GraduationCap size={16} aria-hidden /> : <Users size={16} aria-hidden />}{option === 'student' ? 'Alunos' : 'Professores'}
        </button>)}
      </div>
      <SearchableSelect label={kind === 'student' ? 'Aluno' : 'Professor'} value={personId} options={directoryOptions} onChange={(id) => { setPersonId(id); setSelectedPerson(directory.data?.items.find((person) => person.id === id) ?? selectedPerson); }} onSearchChange={setSearch} placeholder={kind === 'student' ? 'Pesquise por nome ou RA' : 'Pesquise pelo nome do professor'} searchPlaceholder={kind === 'student' ? 'Nome ou RA do aluno' : 'Nome do professor'} emptyLabel={directory.isFetching ? 'Consultando GameFY...' : debouncedSearch.length < 2 ? 'Digite pelo menos 2 caracteres.' : 'Nenhuma pessoa encontrada.'} />
      {directory.isError ? <p role="alert" className="mt-2 text-small text-danger-text">Não foi possível consultar o diretório do GameFY. Tente novamente.</p> : null}
      {currentPerson ? <p className="mt-3 text-small text-slate">Registro selecionado: <strong className="text-ink">{currentPerson.name}</strong>{currentPerson.course ? ` · ${currentPerson.course}` : ''}{currentPerson.semester ? ` · ${currentPerson.semester}º semestre` : ''}{currentPerson.period ? ` · ${currentPerson.period}` : ''}{currentPerson.classCode ? ` · Turma ${currentPerson.classCode}` : ''}{currentPerson.department ? ` · ${currentPerson.department}` : ''}</p> : null}
    </Surface>

    <Surface>
      <SectionHeader title="Catálogo acadêmico" description="Os campos abaixo usam pesquisa instantânea sobre registros da fonte GameFY, em vez de listas fixas." />
      {catalog.isError ? <p role="alert" className="rounded-md bg-danger-soft p-3 text-small text-danger-text">O catálogo GameFY não está disponível. As opções não são substituídas por dados de exemplo.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SearchableSelect label="Curso" value={courseId} options={courses.map((course) => ({ value: course.id, label: course.name, description: `${course.totalSemesters} semestres` }))} onChange={(value) => { setCourseId(value); setSubjectId(''); setClassId(''); }} placeholder="Pesquise um curso" searchPlaceholder="Buscar curso" emptyLabel={catalog.isLoading ? 'Carregando do GameFY...' : 'Nenhum curso encontrado.'} />
        <SearchableSelect label="Disciplina" value={subjectId} options={subjects.map((subject) => ({ value: subject.id, label: subject.name, description: subject.semester ? `${subject.semester}º semestre` : undefined }))} onChange={setSubjectId} placeholder="Pesquise uma disciplina" searchPlaceholder="Buscar disciplina" emptyLabel={courseId ? 'Nenhuma disciplina deste curso.' : 'Selecione um curso para filtrar disciplinas.'} disabled={!courseId} />
        <SearchableSelect label="Período letivo" value={termId} options={(catalog.data?.terms ?? []).map((term) => ({ value: term.id, label: term.title, description: `${term.startsAt ?? ''}${term.endsAt ? ` a ${term.endsAt}` : ''}${term.current ? ' · atual' : ''}` }))} onChange={setTermId} placeholder="Pesquise um período" searchPlaceholder="Buscar período" emptyLabel="Nenhum período letivo encontrado." />
        <SearchableSelect label="Turma / período" value={classId} options={classes.map((item) => ({ value: item.id, label: `${item.semester}º semestre · ${item.period} · Turma ${item.classCode}` }))} onChange={setClassId} placeholder="Pesquise uma turma" searchPlaceholder="Buscar turma ou período" emptyLabel={courseId ? 'Nenhuma turma ativa para este curso.' : 'Selecione um curso para filtrar turmas.'} disabled={!courseId} />
      </div>
      {catalog.data ? <div className="mt-5 flex flex-wrap gap-2" aria-label="Resumo do catálogo">
        <Badge tone="success">{courses.length} cursos</Badge><Badge tone="neutral">{catalog.data.subjects.length} disciplinas</Badge><Badge tone="neutral">{catalog.data.terms.length} períodos letivos</Badge><Badge tone="neutral">{catalog.data.classes.length} turmas ativas</Badge>
      </div> : null}
      {(selectedCourse || selectedSubject || selectedTerm || selectedClass) ? <div className="mt-5 rounded-md bg-paper p-4 text-small text-slate"><strong className="text-ink">Seleção acadêmica</strong><p className="mt-1">{[selectedCourse?.name, selectedSubject?.name, selectedTerm?.title, selectedClass ? `${selectedClass.semester}º semestre · ${selectedClass.period} · Turma ${selectedClass.classCode}` : null].filter(Boolean).join(' · ')}</p></div> : null}
      {catalog.data ? <p className="mt-4 text-caption text-mist">Fonte: GameFY · atualização consultada em {new Date(catalog.data.updatedAt).toLocaleString('pt-BR')}.</p> : null}
    </Surface>
  </div>;
}
