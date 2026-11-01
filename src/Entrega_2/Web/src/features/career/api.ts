import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api/client';

export interface CareerProfile {
  id: string | null; course: string | null; academicDataVerified: boolean; semester: number | null; careerObjective: string; firstInternship: boolean;
  skills: string[]; interests: string[]; city: string | null; state: string | null; region: string | null;
  preferredRadiusKm: number | null; modalities: Array<'onsite'|'hybrid'|'remote'>; availability: Record<string, unknown>;
  personalizationEnabled: boolean; updatedAt?: string;
}
export interface JobMatch {
  opportunityId: string; score: number; confidence: number; eligibility: 'eligible'|'ineligible'|'unverified';
  factors: Record<string, number | null>; matchedSkills: string[]; missingSkills: string[]; reasons: string[]; warnings: string[]; algorithmVersion: string;
}
export interface JobOpportunity {
  id: string; sourceName: string; canonicalUrl: string; companyName: string; title: string; description: string;
  jobType: string; professionalArea: string | null; acceptedCourses: string[]; minSemester: number | null; maxSemester: number | null;
  requiredSkills: string[]; desiredSkills: string[]; city: string | null; state: string | null; workMode: 'onsite'|'hybrid'|'remote'|'unknown';
  stipendMin: number | null; stipendMax: number | null; workloadHours: number | null; publishedAt: string | null; expiresAt: string | null;
  lastVerifiedAt: string; status: string; match?: JobMatch; savedAt?: string; applicationStatus?: string; statusSource?: string;
  notificationId?: string; notifiedAt?: string; readAt?: string | null;
}
export interface JobSource { id: string; name: string; connectorType: 'greenhouse'|'lever'; boardSlug: string; authorizationStatus: string; authorizationReference?: string; enabled: boolean; syncIntervalMinutes: number; healthStatus: string; lastSyncAt?: string; lastSuccessAt?: string }
export interface CareerFilters { search?: string; type?: string; workMode?: string; city?: string; state?: string; limit?: number; offset?: number }
export type CareerProfileInput = Partial<Omit<CareerProfile, 'id'|'updatedAt'>>;
export interface AlertPreferences { enabled: boolean; minimumMatchScore: number; frequency: 'immediate'|'daily'|'weekly'|'off'; channels: Array<'in_app'> }

const careerKey = ['career'] as const;
export const careerKeys = { all: careerKey, profile: [...careerKey,'profile'], jobs: (filters: CareerFilters) => [...careerKey,'jobs',filters], recommendations: [...careerKey,'recommendations'], saved: [...careerKey,'saved'], applications: [...careerKey,'applications'], alerts: [...careerKey,'alerts'], notifications: [...careerKey,'notifications'], sources: [...careerKey,'sources'], runs: [...careerKey,'runs'], report: [...careerKey,'report'] };

export const careerApi = {
  profile: () => api.get<CareerProfile>('/api/v1/career/profile'),
  updateProfile: (body: CareerProfileInput) => api.patch<CareerProfile>('/api/v1/career/profile', body),
  jobs: (filters: CareerFilters = {}) => api.get<{ items: JobOpportunity[]; limit: number; offset: number }>('/api/v1/career/jobs', { query: { ...filters } }),
  recommendations: () => api.get<{ profileReady: boolean; items: JobOpportunity[]; profile: CareerProfile }>('/api/v1/career/recommendations'),
  saved: () => api.get<JobOpportunity[]>('/api/v1/career/saved'),
  save: (opportunityId: string) => api.post<{ saved: boolean }>('/api/v1/career/saved', { opportunityId }),
  unsave: (id: string) => api.delete<{ deleted: boolean }>(`/api/v1/career/saved/${encodeURIComponent(id)}`),
  feedback: (opportunityId: string, feedback: 'interested'|'not_interested'|'irrelevant') => api.post('/api/v1/career/feedback', { opportunityId, feedback }),
  applications: () => api.get<JobOpportunity[]>('/api/v1/career/applications'),
  setApplication: (opportunityId: string, status: string) => api.post('/api/v1/career/applications', { opportunityId, status }),
  alerts: () => api.get<AlertPreferences>('/api/v1/career/alerts'),
  updateAlerts: (body: AlertPreferences) => api.patch<AlertPreferences>('/api/v1/career/alerts', body),
  notifications: () => api.get<JobOpportunity[]>('/api/v1/career/notifications'),
  markNotificationRead: (id: string) => api.patch(`/api/v1/career/notifications/${encodeURIComponent(id)}/read`, {}),
  sources: () => api.get<JobSource[]>('/api/v1/admin/career/sources'),
  createSource: (body: Omit<JobSource,'id'|'healthStatus'>) => api.post<JobSource>('/api/v1/admin/career/sources', body),
  updateSource: (id: string, body: Partial<JobSource> & { name: string }) => api.patch<JobSource>(`/api/v1/admin/career/sources/${encodeURIComponent(id)}`, body),
  runs: () => api.get<Array<Record<string, unknown>>>('/api/v1/admin/career/collection-runs'),
  collect: () => api.post<Record<string, number>>('/api/v1/admin/career/collect', {}),
  report: () => api.get<Record<string, number>>('/api/v1/admin/career/report'),
};

export function useCareerProfile() { return useQuery({ queryKey: careerKeys.profile, queryFn: careerApi.profile }); }
export function useCareerRecommendations() { return useQuery({ queryKey: careerKeys.recommendations, queryFn: careerApi.recommendations }); }
export function useCareerJobs(filters: CareerFilters) { return useQuery({ queryKey: careerKeys.jobs(filters), queryFn: () => careerApi.jobs(filters) }); }
export function useCareerSaved() { return useQuery({ queryKey: careerKeys.saved, queryFn: careerApi.saved }); }
export function useCareerApplications() { return useQuery({ queryKey: careerKeys.applications, queryFn: careerApi.applications }); }
export function useCareerAlerts() { return useQuery({ queryKey: careerKeys.alerts, queryFn: careerApi.alerts }); }
export function useSaveCareerJob() {
  const client = useQueryClient();
  return useMutation({ mutationFn: async ({ id, saved }: { id: string; saved: boolean }) => { if (saved) await careerApi.unsave(id); else await careerApi.save(id); }, onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: careerKeys.saved }), client.invalidateQueries({ queryKey: careerKeys.jobs({}) })]); } });
}
export function useUpdateCareerProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: careerApi.updateProfile, onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: careerKeys.profile }), client.invalidateQueries({ queryKey: careerKeys.recommendations })]); } });
}
