import { Router } from "express";
import { getStorePickupSlots } from "../controllers/fulfilmentController";

const router = Router();

router.get("/stores/:storeId/pickup-slots", getStorePickupSlots);

export default router;
