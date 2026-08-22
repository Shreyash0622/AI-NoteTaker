import { Router } from "express";
import { prisma } from "../../db/client.js";

export const healthRouter = Router();

healthRouter.get("/", async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({ status: "ok", database: "ok" });
  } catch {
    response.status(503).json({ status: "degraded", database: "unavailable" });
  }
});
