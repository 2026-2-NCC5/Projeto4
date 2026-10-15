import type { Permission, UserRole } from '@/types/api';

/**
 * Cópia da matriz do servidor (Backend/api/src/auth/permissions.ts) só para montar perfis de teste.
 * O portal nunca decide autorização: ele usa a lista que a API devolve em /api/auth/me.
 */
const OWN: Permission[] = ['account:read:own', 'account:sessions:own', 'notifications:read:own'];
const MATRIX: Record<UserRole, Permission[]> = {
  student: [...OWN, 'academic:read:own', 'agent:run:own', 'agent:feedback:own', 'assistant:use', 'tickets:create:own', 'tickets:read:own', 'appointments:book:own', 'kb:read:published'],
  institutional_staff: [
    ...OWN,
    'tickets:read:any',
    'tickets:manage',
    'tickets:internal_note',
    'appointments:read:any',
    'appointments:manage',
    'availability:manage:own',
    'kb:read:published',
    'kb:read:all',
    'kb:write',
    'kb:publish',
    'students:read:support_context',
    'metrics:read',
    'reports:export',
    'agent:insights:read',
    'audit:read:own',
  ],
  technical_admin: [
    ...OWN,
    'tickets:read:metadata',
    'availability:manage:any',
    'kb:read:published',
    'kb:read:all',
    'kb:write',
    'kb:publish',
    'metrics:read',
    'reports:export',
    'agent:insights:read',
    'audit:read:own',
    'audit:read:any',
    'users:manage',
    'sessions:revoke:any',
    'settings:manage',
    'sla:manage',
    'automations:manage',
    'integrations:read',
    'health:read',
    'permissions:read',
  ],
};

export const permissionsFor = (role: UserRole): Permission[] => [...MATRIX[role]];
