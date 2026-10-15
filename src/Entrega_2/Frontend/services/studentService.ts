import { API_ROUTES } from '../config/services';
import type {
  StudentAssessment,
  StudentAttendance,
  StudentPendingItem,
  StudentProfile,
  StudentSubject,
  StudentSummary,
} from '../types/api';

import { request } from './apiClient';

export const getMe = (): Promise<StudentProfile> => request<StudentProfile>(API_ROUTES.student.me);
export const getSummary = (): Promise<StudentSummary> => request<StudentSummary>(API_ROUTES.student.summary);
export const getSubjects = (): Promise<StudentSubject[]> => request<StudentSubject[]>(API_ROUTES.student.subjects);
export const getAssessments = (): Promise<StudentAssessment[]> =>
  request<StudentAssessment[]>(API_ROUTES.student.assessments);
export const getAttendance = (): Promise<StudentAttendance[]> =>
  request<StudentAttendance[]>(API_ROUTES.student.attendance);
export const getPendingItems = (): Promise<StudentPendingItem[]> =>
  request<StudentPendingItem[]>(API_ROUTES.student.pendingItems);

export const studentService = { getMe, getSummary, getSubjects, getAssessments, getAttendance, getPendingItems };
