import { Router } from "express";
import { clearSemanticCache } from "../services/semanticCache.js";

const router = Router();

router.delete("/:workspaceId", async (req, res, next) => {
  try {
    const { workspaceId } = req.params;
    await clearSemanticCache(workspaceId);
    res.json({ cleared: true, workspaceId });
  } catch (err) {
    next(err);
  }
});

export default router;
