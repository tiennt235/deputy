import { Cron } from "croner";
import { prisma } from "@loop/db";
import { runAutomation } from "./orchestrator.js";

const jobs = new Map<string, Cron>();

/** (Re)load enabled automations and schedule them by cron expression. */
export async function reloadScheduler(): Promise<void> {
  for (const job of jobs.values()) job.stop();
  jobs.clear();

  const autos = await prisma.automation.findMany({ where: { enabled: true } });
  for (const a of autos) {
    try {
      const job = new Cron(a.cron, { name: a.id }, async () => {
        try {
          const n = await runAutomation(a.id);
          console.log(`[scheduler] automation ${a.name} filed ${n} task(s)`);
        } catch (err) {
          console.error(`[scheduler] automation ${a.name} failed:`, err);
        }
      });
      jobs.set(a.id, job);
    } catch (err) {
      console.error(`[scheduler] invalid cron for ${a.name}: ${a.cron}`);
    }
  }
  console.log(`[scheduler] ${jobs.size} automation(s) scheduled`);
}

export function startScheduler(): void {
  void reloadScheduler();
}
