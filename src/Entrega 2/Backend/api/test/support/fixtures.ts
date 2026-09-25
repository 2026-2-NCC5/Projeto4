import bcrypt from 'bcryptjs';
import type { InMemoryData } from './inMemoryRepositories.js';

export const DEMO_PASSWORD = 'Demo@2026';

// Hash pré-calculado (bcrypt, custo 4) para manter os testes rápidos.
const PASSWORD_HASH = bcrypt.hashSync(DEMO_PASSWORD, 4);

export const USERS = {
  student1: { id: '00000000-0000-4000-8000-000000000001', email: 'estudante.exemplo@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Estudante Exemplo', role: 'student' as const, isActive: true },
  student2: { id: '00000000-0000-4000-8000-000000000002', email: 'estudante.regular@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Estudante Regular', role: 'student' as const, isActive: true },
  student5: { id: '00000000-0000-4000-8000-000000000005', email: 'estudante.multiplo@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Estudante Múltiplo', role: 'student' as const, isActive: true },
  student6: { id: '00000000-0000-4000-8000-000000000006', email: 'estudante.semdados@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Estudante Sem Dados', role: 'student' as const, isActive: true },
  staff: { id: '00000000-0000-4000-8000-000000000099', email: 'responsavel.exemplo@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Responsável Exemplo', role: 'institutional_staff' as const, isActive: true },
  inactive: { id: '00000000-0000-4000-8000-000000000050', email: 'inativo@demo.asa', passwordHash: PASSWORD_HASH, fullName: 'Conta Inativa', role: 'student' as const, isActive: false },
};

/** Relógio fixo dos testes do assistente: quarta-feira, 16/09/2026, 12h em São Paulo. */
export const FIXED_NOW = () => new Date('2026-09-16T15:00:00.000Z');

export const SUBJECT_CATALOG = [
  { id: 'subject-demo-001', code: 'CC501', name: 'Inteligência Artificial' },
  { id: 'subject-demo-002', code: 'CC502', name: 'Banco de Dados' },
  { id: 'subject-demo-003', code: 'CC503', name: 'Engenharia de Software' },
  { id: 'subject-demo-004', code: 'CC504', name: 'Computação em Nuvem' },
  { id: 'subject-demo-005', code: 'CC505', name: 'Estruturas de Dados' },
];

export function buildFixtureData(): InMemoryData {
  return {
    users: Object.values(USERS).map((user) => ({ ...user })),
    subjectCatalog: SUBJECT_CATALOG,
    programs: [
      { code: 'ADM', name: 'Administração' },
      { code: 'ADS', name: 'Análise e Desenvolvimento de Sistemas' },
      { code: 'CCOMP', name: 'Ciências da Computação' },
    ],
    students: [
      { id: 'student-demo-001', userId: USERS.student1.id, registrationNumber: 'DEMO-2026-001', program: 'Ciências da Computação' },
      { id: 'student-demo-002', userId: USERS.student2.id, registrationNumber: 'DEMO-2026-002', program: 'Ciências da Computação' },
      { id: 'student-demo-005', userId: USERS.student5.id, registrationNumber: 'DEMO-2026-005', program: 'Administração' },
      { id: 'student-demo-006', userId: USERS.student6.id, registrationNumber: 'DEMO-2026-006', program: 'Ciências Contábeis' },
    ],
    enrollments: {
      'student-demo-005': [
        { enrollmentId: 'enrollment-demo-005-1', subjectId: 'subject-demo-002', code: 'CC502', name: 'Banco de Dados', status: 'active' },
        { enrollmentId: 'enrollment-demo-005-2', subjectId: 'subject-demo-004', code: 'CC504', name: 'Computação em Nuvem', status: 'active' },
      ],
      'student-demo-001': [
        { enrollmentId: 'enrollment-demo-001-1', subjectId: 'subject-demo-001', code: 'CC501', name: 'Inteligência Artificial', status: 'active' },
        { enrollmentId: 'enrollment-demo-001-2', subjectId: 'subject-demo-002', code: 'CC502', name: 'Banco de Dados', status: 'active' },
      ],
      'student-demo-002': [
        { enrollmentId: 'enrollment-demo-002-1', subjectId: 'subject-demo-001', code: 'CC501', name: 'Inteligência Artificial', status: 'active' },
      ],
    },
    assessments: {
      'student-demo-005': [
        { id: 'assessment-demo-005-1', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', title: 'Prova 1', type: 'exam', score: 4.5, maxScore: 10, appliedAt: '2026-08-27' },
        { id: 'assessment-demo-005-2', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', title: 'Trabalho', type: 'assignment', score: 5.5, maxScore: 10, appliedAt: '2026-09-08' },
        { id: 'assessment-demo-005-3', subjectId: 'subject-demo-004', subjectName: 'Computação em Nuvem', title: 'Prova 1', type: 'exam', score: 7, maxScore: 10, appliedAt: '2026-09-01' },
        { id: 'assessment-demo-005-4', subjectId: 'subject-demo-004', subjectName: 'Computação em Nuvem', title: 'Prova 2', type: 'exam', score: null, maxScore: 10, appliedAt: '2026-09-24' },
      ],
      'student-demo-001': [
        { id: 'assessment-demo-001-1', subjectId: 'subject-demo-001', subjectName: 'Inteligência Artificial', title: 'Prova 1', type: 'exam', score: 8.2, maxScore: 10, appliedAt: '2026-08-27' },
        { id: 'assessment-demo-001-2', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', title: 'Prova 1', type: 'exam', score: 7, maxScore: 10, appliedAt: '2026-08-29' },
        { id: 'assessment-demo-001-3', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', title: 'Trabalho prático', type: 'assignment', score: null, maxScore: 10, appliedAt: '2026-09-21' },
      ],
      'student-demo-002': [
        { id: 'assessment-demo-002-1', subjectId: 'subject-demo-001', subjectName: 'Inteligência Artificial', title: 'Prova 1', type: 'exam', score: 9, maxScore: 10, appliedAt: '2026-08-27' },
      ],
    },
    attendance: {
      'student-demo-005': [
        { subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', totalClasses: 10, attendedClasses: 10 },
        { subjectId: 'subject-demo-004', subjectName: 'Computação em Nuvem', totalClasses: 18, attendedClasses: 14 },
      ],
      'student-demo-001': [
        { subjectId: 'subject-demo-001', subjectName: 'Inteligência Artificial', totalClasses: 10, attendedClasses: 9 },
        { subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', totalClasses: 10, attendedClasses: 10 },
      ],
      'student-demo-002': [{ subjectId: 'subject-demo-001', subjectName: 'Inteligência Artificial', totalClasses: 10, attendedClasses: 10 }],
    },
    pendingItems: {
      'student-demo-005': [
        { id: 'pending-demo-005-1', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', type: 'assignment', description: 'Entrega do projeto de modelagem', dueDate: '2026-09-18', status: 'pending' },
        { id: 'pending-demo-005-2', subjectId: 'subject-demo-004', subjectName: 'Computação em Nuvem', type: 'assessment', description: 'Questionário sobre containers', dueDate: '2026-09-15', status: 'overdue' },
        { id: 'pending-demo-005-3', subjectId: 'subject-demo-004', subjectName: 'Computação em Nuvem', type: 'assignment', description: 'Relatório de custos em nuvem', dueDate: '2026-09-25', status: 'pending' },
        { id: 'pending-demo-005-4', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', type: 'assignment', description: 'Lista 1', dueDate: '2026-09-01', status: 'completed' },
      ],
      'student-demo-001': [
        { id: 'pending-demo-001', subjectId: 'subject-demo-002', subjectName: 'Banco de Dados', type: 'assignment', description: 'Entrega do trabalho prático de Banco de Dados', dueDate: '2026-09-21', status: 'pending' },
      ],
    },
  };
}
