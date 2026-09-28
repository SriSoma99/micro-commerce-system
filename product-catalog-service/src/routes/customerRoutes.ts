import { Router } from "express";
import {
  createAddress,
  deleteAddress,
  deleteMe,
  exportMe,
  getMe,
  listAddresses,
  updateAddress,
  updateMe,
} from "../controllers/customerController";
import { getMyInvoice, getMyInvoiceHtml, listMyInvoices } from "../controllers/invoiceController";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

// Every /customers/me route is scoped to the signed-in customer.
router.use("/customers/me", requireAuth);

router.get("/customers/me", getMe);
router.get("/customers/me/export", exportMe);
router.patch("/customers/me", updateMe);
router.delete("/customers/me", deleteMe);

router.get("/customers/me/addresses", listAddresses);
router.post("/customers/me/addresses", createAddress);
router.patch("/customers/me/addresses/:addressId", updateAddress);
router.delete("/customers/me/addresses/:addressId", deleteAddress);

router.get("/customers/me/invoices", listMyInvoices);
router.get("/customers/me/invoices/:invoiceId", getMyInvoice);
router.get("/customers/me/invoices/:invoiceId/html", getMyInvoiceHtml);

export default router;
