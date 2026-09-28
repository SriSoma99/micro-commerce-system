import { Request, Response } from "express";
import {
  listSavedPaymentMethods,
  savePaymentMethod,
  deleteSavedPaymentMethod,
  setDefaultPaymentMethod,
} from "../data/savedPaymentRepository";
import { currentCustomer } from "../middleware/requireAuth";

export function listPaymentMethodsHandler(_req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const cards = listSavedPaymentMethods(customer.id);
  res.status(200).json({ paymentMethods: cards });
}

export function savePaymentMethodHandler(req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const { token, brand, last4, expMonth, expYear, isDefault } = req.body;
  if (!token || !brand || !last4 || expMonth === undefined || expYear === undefined) {
    res.status(400).json({ error: "INVALID_REQUEST", message: "Missing required card details (token, brand, last4, expMonth, expYear)" });
    return;
  }

  const card = savePaymentMethod(customer.id, {
    token: String(token),
    brand: String(brand),
    last4: String(last4),
    expMonth: Number(expMonth),
    expYear: Number(expYear),
    isDefault: Boolean(isDefault),
  });

  res.status(201).json({ paymentMethod: card });
}

export function deletePaymentMethodHandler(req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const cardId = String(req.params.cardId ?? "");
  const deleted = deleteSavedPaymentMethod(customer.id, cardId);
  if (!deleted) {
    res.status(404).json({ error: "NOT_FOUND", message: "Payment method not found" });
    return;
  }

  res.status(200).json({ message: "Payment method deleted successfully" });
}

export function setDefaultPaymentMethodHandler(req: Request, res: Response): void {
  const customer = currentCustomer(res);
  const cardId = String(req.params.cardId ?? "");
  const updated = setDefaultPaymentMethod(customer.id, cardId);
  if (!updated) {
    res.status(404).json({ error: "NOT_FOUND", message: "Payment method not found" });
    return;
  }

  res.status(200).json({ message: "Default payment method updated" });
}
