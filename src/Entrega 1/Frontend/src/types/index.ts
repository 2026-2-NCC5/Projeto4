export type TabKey = 'home' | 'academic' | 'assistant' | 'recommendations' | 'profile';

export type Subject = {
  id: string;
  code: string;
  name: string;
  professor: string;
  progress: number;
  grade: number | null;
  attendance: number;
  status: 'ok' | 'attention';
};

export type PendingItem = {
  id: string;
  subjectId: string;
  subject: string;
  title: string;
  dueLabel: string;
  dueDate: string;
  priority: 'alta' | 'média' | 'baixa';
};

export type Recommendation = {
  id: string;
  type: string;
  title: string;
  message: string;
  evidence: string[];
  nextAction: string;
  confidence: number;
  requiresHumanValidation: boolean;
  tone: 'attention' | 'info' | 'success';
};

export type AssistantMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  evidence?: string[];
  nextAction?: string;
  requiresHumanValidation?: boolean;
  createdAt: Date;
};
