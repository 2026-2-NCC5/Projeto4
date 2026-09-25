import type { Request, Response } from 'express';
import type { StudentService } from '../services/studentService.js';
import { ok } from './respond.js';

export function createStudentController(students: StudentService) {
  return {
    async me(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.getProfile(req.auth!));
    },
    async summary(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.getSummary(req.student!.id));
    },
    async subjects(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.listSubjects(req.student!.id));
    },
    async assessments(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.listAssessments(req.student!.id));
    },
    async attendance(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.listAttendance(req.student!.id));
    },
    async pendingItems(req: Request, res: Response): Promise<void> {
      ok(req, res, await students.listPendingItems(req.student!.id));
    },
  };
}
