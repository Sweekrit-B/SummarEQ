import express from "express";
import * as SummaryController from "../controllers/summary";
import * as AuthController from "../controllers/auth";

const router = express.Router();

router.post("/summary", SummaryController.createSummary);
router.get("/summary/:id", SummaryController.getSummary);
router.get("/summary/all", SummaryController.getAllSummaries);

router.get("/auth/redirect", AuthController.redirectAuth);
router.get("/auth/callback", AuthController.callbackAuth);
router.get("/auth/success", AuthController.successAuth);

export default router;
