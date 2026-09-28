import { Router } from "express";
import {
  addItem,
  clearCart,
  getCart,
  removeItem,
  updateQuantity,
} from "../controllers/cartController";

const router = Router();

router.get("/cart/:cartId", getCart);
router.post("/cart/:cartId/items", addItem);
router.patch("/cart/:cartId/items/:lineItemId", updateQuantity);
router.delete("/cart/:cartId/items/:lineItemId", removeItem);
router.delete("/cart/:cartId", clearCart);

export default router;
