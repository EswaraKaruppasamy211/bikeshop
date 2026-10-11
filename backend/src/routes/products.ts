import { Router } from "express";
import { listProducts, productDetails } from "../controllers/product-controller.js";

export const productsRouter = Router();
productsRouter.get("/", listProducts);
productsRouter.get("/:id", productDetails);
