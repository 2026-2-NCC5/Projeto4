import type { AgentAcademicContext } from '../contracts/agentContract.js';
import type {
  StudentAssessment,
  StudentAttendance,
  StudentPendingItem,
  StudentProfile,
  StudentSubject,
  StudentSummary,
} from '../contracts/mobileApi.v1.js';
import { ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { Repositories } from '../repositories/types.js';
import type { AuthContext, StudentRecord } from '../types/domain.js';

const OPEN_PENDING = new Set(['pending', 'overdue']);

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export class StudentService {
  constructor(private readonly repos: Repositories) {}

  /** Deriva o estudante exclusivamente da sessão autenticada (TASK-004 §33-34). */
  async resolveStudent(auth: AuthContext): Promise<StudentRecord> {
    if (auth.role !== 'student') {
      throw new ForbiddenError('Este recurso é exclusivo para estudantes.');
    }
    const student = await this.repos.students.findByUserId(auth.userId);
    if (!student) throw new NotFoundError('Registro de estudante não encontrado para esta conta.');
    return student;
  }

  async getProfile(auth: AuthContext): Promise<StudentProfile> {
    const student = await this.resolveStudent(auth);
    const user = await this.repos.users.findById(student.userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return {
      id: student.id,
      userId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      registrationNumber: student.registrationNumber,
      program: student.program,
    };
  }

  async listSubjects(studentId: string): Promise<StudentSubject[]> {
    const [enrollments, assessments, attendance, pending, latestRun] = await Promise.all([
      this.repos.students.listEnrollments(studentId),
      this.repos.students.listAssessments(studentId),
      this.repos.students.listAttendance(studentId),
      this.repos.students.listPendingItems(studentId),
      this.repos.agentRuns.findLatestByStudent(studentId),
    ]);
    const attentionSubjects = new Set((latestRun?.recommendations ?? []).map((rec) => rec.subjectId).filter(Boolean));
    return enrollments.map((enrollment) => {
      const graded = assessments.filter((item) => item.subjectId === enrollment.subjectId && item.score !== null);
      const totalMax = graded.reduce((sum, item) => sum + item.maxScore, 0);
      const totalScore = graded.reduce((sum, item) => sum + (item.score ?? 0), 0);
      const att = attendance.find((item) => item.subjectId === enrollment.subjectId);
      return {
        id: enrollment.subjectId,
        code: enrollment.code,
        name: enrollment.name,
        enrollmentStatus: enrollment.status,
        averageScore: totalMax > 0 ? round((totalScore / totalMax) * 10, 1) : null,
        attendanceRate: att && att.totalClasses > 0 ? round(att.attendedClasses / att.totalClasses, 3) : null,
        pendingCount: pending.filter((item) => item.subjectId === enrollment.subjectId && OPEN_PENDING.has(item.status)).length,
        attention: attentionSubjects.has(enrollment.subjectId),
      };
    });
  }

  async listAssessments(studentId: string): Promise<StudentAssessment[]> {
    return this.repos.students.listAssessments(studentId);
  }

  async listAttendance(studentId: string): Promise<StudentAttendance[]> {
    const rows = await this.repos.students.listAttendance(studentId);
    return rows.map((row) => ({
      ...row,
      attendanceRate: row.totalClasses > 0 ? round(row.attendedClasses / row.totalClasses, 3) : null,
    }));
  }

  async listPendingItems(studentId: string): Promise<StudentPendingItem[]> {
    return this.repos.students.listPendingItems(studentId);
  }

  async getSummary(studentId: string): Promise<StudentSummary> {
    const [enrollments, assessments, attendance, pending, latestRun] = await Promise.all([
      this.repos.students.listEnrollments(studentId),
      this.repos.students.listAssessments(studentId),
      this.repos.students.listAttendance(studentId),
      this.repos.students.listPendingItems(studentId),
      this.repos.agentRuns.findLatestByStudent(studentId),
    ]);
    const graded = assessments.filter((item) => item.score !== null);
    const totalMax = graded.reduce((sum, item) => sum + item.maxScore, 0);
    const totalScore = graded.reduce((sum, item) => sum + (item.score ?? 0), 0);
    const totalClasses = attendance.reduce((sum, item) => sum + item.totalClasses, 0);
    const attended = attendance.reduce((sum, item) => sum + item.attendedClasses, 0);
    const attentionSubjects = new Set((latestRun?.recommendations ?? []).map((rec) => rec.subjectId ?? `rec:${rec.id}`));
    return {
      subjectsCount: enrollments.filter((item) => item.status === 'active').length,
      pendingCount: pending.filter((item) => OPEN_PENDING.has(item.status)).length,
      attentionCount: attentionSubjects.size,
      averageScore: totalMax > 0 ? round((totalScore / totalMax) * 10, 1) : null,
      averageAttendanceRate: totalClasses > 0 ? round(attended / totalClasses, 3) : null,
      lastAnalysis: latestRun
        ? {
            runId: latestRun.runId,
            status: latestRun.status,
            summary: latestRun.summary,
            recommendationsCount: latestRun.recommendations.length,
            requiresHumanValidation: latestRun.requiresHumanValidation,
            abstained: latestRun.abstained,
            createdAt: latestRun.createdAt.toISOString(),
          }
        : null,
    };
  }

  /** Monta o contexto acadêmico enviado ao Agent Service (somente dados necessários). */
  async buildAcademicContext(studentId: string): Promise<AgentAcademicContext> {
    const [enrollments, assessments, attendance, pending] = await Promise.all([
      this.repos.students.listEnrollments(studentId),
      this.repos.students.listAssessments(studentId),
      this.repos.students.listAttendance(studentId),
      this.repos.students.listPendingItems(studentId),
    ]);
    const active = enrollments.filter((item) => item.status === 'active');
    const activeIds = new Set(active.map((item) => item.subjectId));
    return {
      subjects: active.map((item) => ({ id: item.subjectId, code: item.code, name: item.name, enrollment_status: item.status })),
      pending_items: pending.map((item) => ({
        id: item.id,
        subject_id: item.subjectId,
        type: item.type,
        description: item.description,
        due_date: item.dueDate,
        status: item.status,
      })),
      attendance: attendance
        .filter((item) => activeIds.has(item.subjectId) && item.totalClasses > 0)
        .map((item) => ({ subject_id: item.subjectId, total_classes: item.totalClasses, attended_classes: item.attendedClasses })),
      assessments: assessments
        .filter((item) => activeIds.has(item.subjectId))
        .map((item) => ({
          id: item.id,
          subject_id: item.subjectId,
          title: item.title,
          type: item.type,
          score: item.score,
          max_score: item.maxScore,
          applied_at: item.appliedAt,
        })),
    };
  }
}
