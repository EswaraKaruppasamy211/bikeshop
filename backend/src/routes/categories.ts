import { Router } from "express";
import { getCategories } from "../controllers/category-controller.js";

export const categoriesRouter = Router();
categoriesRouter.get("/", getCategories);
