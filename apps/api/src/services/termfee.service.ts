import { prisma } from "../config/prisma";

/* Quarterly tuition: Primary / Junior Secondary / Senior Secondary */
export function feeForLevel(levelName?: string | null): number | null {
  const n = String(levelName || "").toLowerCase();
  if (n.includes("junior")) return Number(process.env.TERM_FEE_JUNIOR || 210000);
  if (n.includes("senior")) return Number(process.env.TERM_FEE_SENIOR || 300000);
  if (n.includes("primary")) return Number(process.env.TERM_FEE_PRIMARY || 150000);
  return null;
}

/* Quarters follow the calendar (Lagos time): Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec */
export function currentPeriod(now: Date = new Date()) {
  const d = new Date(now.getTime() + 60 * 60 * 1000);
  const year = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return periodInfo(`${year}-Q${q}`);
}

export function periodInfo(period: string) {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  const year = m ? m[1] : String(new Date().getUTCFullYear());
  const q = m ? Number(m[2]) : 1;
  const months = ["Jan – Mar", "Apr – Jun", "Jul – Sep", "Oct – Dec"][q - 1];
  return { period: `${year}-Q${q}`, label: `Quarter ${q}, ${year} (${months})` };
}

export async function hasPaidCurrentTerm(studentId: string): Promise<boolean> {
  const rec = await prisma.termFee.findUnique({
    where: { studentId_period: { studentId, period: currentPeriod().period } },
    select: { status: true }
  });
  return rec?.status === "PAID";
}
