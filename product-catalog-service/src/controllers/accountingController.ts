import type { Request, Response } from "express";
import { accountingService } from "../services/accountingService";

function makePayload<T>(data: T) {
  return {
    data,
    isFallback: false,
    source: "live-core",
    retrievedAt: new Date().toISOString(),
  };
}

export const accountingController = {
  getOverview(req: Request, res: Response): void {
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getOverview(storeId);
    res.json(makePayload(result));
  },

  getDailySales(req: Request, res: Response): void {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getDailySales(days, storeId);
    res.json(makePayload(result));
  },

  getPipeline(req: Request, res: Response): void {
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getPipelineMetrics(storeId);
    res.json(makePayload(result));
  },

  getMonthlyTrends(req: Request, res: Response): void {
    const months = req.query.months ? parseInt(req.query.months as string, 10) : 12;
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getMonthlyTrends(months, storeId);
    res.json(makePayload(result));
  },

  getProductVelocity(req: Request, res: Response): void {
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getProductVelocity(storeId);
    res.json(makePayload(result));
  },

  getGrossMargins(req: Request, res: Response): void {
    const storeId = req.query.storeId as string | undefined;
    const result = accountingService.getGrossMargins(storeId);
    res.json(makePayload(result));
  },

  getStoreRegionalBreakdown(_req: Request, res: Response): void {
    const result = accountingService.getStoreRegionalBreakdown();
    res.json(makePayload(result));
  },

  getTaxLiabilityLedger(_req: Request, res: Response): void {
    const result = accountingService.getTaxLiabilityLedger();
    res.json(makePayload(result));
  },

  getTransactionAuditLogs(req: Request, res: Response): void {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    const storeId = req.query.storeId as string | undefined;
    const paymentMethod = req.query.paymentMethod as string | undefined;
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const result = accountingService.getTransactionAuditLogs({
      limit,
      offset,
      storeId,
      paymentMethod,
      status,
      search,
    });
    res.json(makePayload(result));
  },
};
