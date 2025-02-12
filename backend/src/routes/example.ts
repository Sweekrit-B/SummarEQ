import express from "express";
import * as ExampleController from "../controllers/example";

const router = express.Router();

router.post("/", ExampleController.createExample);
router.get("/:id", ExampleController.getExample);
router.get("/", ExampleController.getAllExamples);

export default router;
