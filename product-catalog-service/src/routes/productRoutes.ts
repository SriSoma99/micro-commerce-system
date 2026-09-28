import { Router } from "express";
import { getProduct, getProductImage, listDepartments, listProducts } from "../controllers/productController";

const router = Router();

router.get("/products", listProducts);
router.get("/products/:id", getProduct);
router.get("/products/:id/image.svg", getProductImage);
router.get("/catalog/departments", listDepartments);

export default router;
