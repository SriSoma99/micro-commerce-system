import { Router } from "express";
import { getOptions, getStatus, getStoreConfig, installStore } from "../controllers/setupController";

const router = Router();

router.get("/setup/status", getStatus);
router.get("/setup/options", getOptions);
router.post("/setup/install", installStore);
router.get("/store-config", getStoreConfig);

export default router;
