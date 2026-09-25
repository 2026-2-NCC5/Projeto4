import { PendingItem, Recommendation, Subject } from '../types';

export const subjects: Subject[] = [
  {
    id: 'sub-1',
    code: 'CC501',
    name: 'Inteligência Artificial',
    professor: 'Profa. Marina Costa',
    progress: 68,
    grade: 8.2,
    attendance: 92,
    status: 'ok',
  },
  {
    id: 'sub-2',
    code: 'CC502',
    name: 'Banco de Dados',
    professor: 'Prof. Ricardo Lima',
    progress: 62,
    grade: 6.5,
    attendance: 84,
    status: 'attention',
  },
  {
    id: 'sub-3',
    code: 'CC503',
    name: 'Engenharia de Software',
    professor: 'Profa. Ana Martins',
    progress: 74,
    grade: 7.8,
    attendance: 88,
    status: 'ok',
  },
  {
    id: 'sub-4',
    code: 'CC504',
    name: 'Computação em Nuvem',
    professor: 'Prof. Paulo Souza',
    progress: 55,
    grade: 7.1,
    attendance: 76,
    status: 'attention',
  },
];

export const pendingItems: PendingItem[] = [
  {
    id: 'pending-1',
    subjectId: 'sub-2',
    subject: 'Banco de Dados',
    title: 'Entrega do trabalho prático',
    dueLabel: 'vence em 2 dias',
    dueDate: '29/08/2026',
    priority: 'alta',
  },
  {
    id: 'pending-2',
    subjectId: 'sub-4',
    subject: 'Computação em Nuvem',
    title: 'Questionário sobre containers',
    dueLabel: 'vence em 5 dias',
    dueDate: '01/09/2026',
    priority: 'média',
  },
];

export const recommendations: Recommendation[] = [
  {
    id: 'rec-1',
    type: 'pending_activity',
    title: 'Priorize Banco de Dados',
    message: 'Existe uma entrega próxima e seu desempenho atual nessa disciplina merece atenção.',
    evidence: [
      'Trabalho prático vence em 2 dias.',
      'Média atual registrada no cenário de demonstração: 6,5.',
    ],
    nextAction: 'Reserve um bloco de estudo hoje e revise os requisitos do trabalho antes de iniciar a entrega.',
    confidence: 0.94,
    requiresHumanValidation: false,
    tone: 'attention',
  },
  {
    id: 'rec-2',
    type: 'attendance_attention',
    title: 'Acompanhe sua frequência',
    message: 'Sua frequência em Computação em Nuvem está próxima do limiar de atenção usado pelo protótipo.',
    evidence: ['Frequência atual no cenário: 76%.', 'Limiar de atenção demonstrativo: 75%.'],
    nextAction: 'Evite novas faltas e confirme com o professor se todos os registros de presença estão atualizados.',
    confidence: 0.89,
    requiresHumanValidation: false,
    tone: 'info',
  },
  {
    id: 'rec-3',
    type: 'positive_progress',
    title: 'Bom progresso em IA',
    message: 'Seu desempenho e frequência em Inteligência Artificial estão consistentes no cenário atual.',
    evidence: ['Média atual: 8,2.', 'Frequência atual: 92%.'],
    nextAction: 'Mantenha a rotina e use a próxima revisão para consolidar os conteúdos antes da próxima avaliação.',
    confidence: 0.96,
    requiresHumanValidation: false,
    tone: 'success',
  },
];

export const academicSummary = {
  subjects: subjects.length,
  pending: pendingItems.length,
  attention: subjects.filter((subject) => subject.status === 'attention').length,
  averageGrade: 7.4,
  averageAttendance: 85,
};
