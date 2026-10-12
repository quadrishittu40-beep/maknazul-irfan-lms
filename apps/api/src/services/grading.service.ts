import { prisma } from "../config/prisma";

export interface GradeResult {
  grade: string;
  passed: boolean;
}

export async function calculateGrade(
  percentage: number,
  passMark: number
): Promise < GradeResult > {
  const scale =
    await prisma.gradeScale.findFirst({
      where: {
        minPercentage: {
          lte: percentage
        },
        maxPercentage: {
          gte: percentage
        }
      },
      orderBy: {
        minPercentage: "desc"
      }
    });
  
  return {
    grade: scale?.grade ?? "F",
    passed: percentage >= passMark
  };
}