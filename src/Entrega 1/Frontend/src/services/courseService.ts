import { supabase } from '../../utils/supabase';

export type Course = {
  id: string;
  code: string;
  name: string;
  total_semesters: number;
  available_periods: string[];
};

export const fallbackCourses: Course[] = [
  {
    id: '262a1342-0582-47e4-800d-107e4c4ebaac',
    code: 'PP',
    name: 'Publicidade e Propaganda',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: '37ebff77-b20f-4f2e-9143-5be31d815c50',
    code: 'ADM',
    name: 'Administração',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: '55d57c30-fcca-4b47-9d1c-6569ce25886c',
    code: 'ECON',
    name: 'Ciências Econômicas',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: '586a423f-b3ef-456d-9761-0135e026be32',
    code: 'ADS',
    name: 'Análise e Desenvolvimento de Sistemas',
    total_semesters: 4,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: '688a96a5-1154-4260-a041-b378bbe9afaa',
    code: 'RI',
    name: 'Relações Internacionais',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: '96980ee9-36f7-402d-bc30-94c845c7cc89',
    code: 'RP',
    name: 'Relações Públicas',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: 'bc92d675-8de5-402f-b77c-2a2f26d4b5e5',
    code: 'CCOMP',
    name: 'Ciências da Computação',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: 'd9b7a6b9-f6d1-4ba5-9bc3-8be21c73b482',
    code: 'CONT',
    name: 'Ciências Contábeis',
    total_semesters: 8,
    available_periods: ['Matutino', 'Noturno'],
  },
  {
    id: 'f29cd9cc-dacd-465b-b676-1c92dd2d164d',
    code: 'SAE',
    name: 'Secretariado e Assessoria Executiva',
    total_semesters: 6,
    available_periods: ['Matutino', 'Noturno'],
  },
];

export async function listCourses() {
  return supabase
    .from('courses')
    .select('id, code, name, total_semesters, available_periods')
    .order('name', { ascending: true });
}
