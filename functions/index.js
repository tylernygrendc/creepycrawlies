import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions";
import { onRequest } from "firebase-functions/https";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes/router.js";
import apiRouter from "./routes/api.js";
import adminRouter from "./routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin SDK
initializeApp();

// Set global options for Cloud Functions v2
setGlobalOptions({ maxInstances: 10 });

// Initialize Express applications
const publicExpressApp = express();
const adminExpressApp = express();

// Configure EJS template engine views for both apps
publicExpressApp.set("view engine", "ejs");
publicExpressApp.set("views", path.join(__dirname, "views"));
adminExpressApp.set("view engine", "ejs");
adminExpressApp.set("views", path.join(__dirname, "views"));

// Parse JSON request bodies
publicExpressApp.use(express.json());
publicExpressApp.use(cookieParser());
adminExpressApp.use(express.json());
adminExpressApp.use(cookieParser());

// Middleware to detect brand from the requested host
const brandDetectionMiddleware = (req, res, next) => {
    const rawHost = (
        req.headers["x-forwarded-host"] ||
        req.hostname ||
        ""
    ).toLowerCase();
    const host = rawHost.split(":")[0];

    // Determine brand: "podpro" vs "fangfarm"
    if (host.includes("thepodpro") || host.includes("podpro")) {
        req.brand = "podpro";
    } else {
        req.brand = "fangfarm";
    }

    // Expose brand info and theme stylesheet to res.locals for EJS templates
    res.locals.brand = req.brand;
    res.locals.isPodPro = req.brand === "podpro";
    res.locals.isFangFarm = req.brand === "fangfarm";
    res.locals.brandName =
        req.brand === "podpro" ? "The Pod Pro" : "The Fang Farm";
    res.locals.brandDomain =
        req.brand === "podpro" ? "thepodpro.org" : "thefangfarm.com";
    res.locals.themeCss =
        req.brand === "podpro"
            ? "/styles/theme-pod-pro.css"
            : "/styles/theme-fang-farm.css";

    next();
};

// Mount the brand detection middleware
publicExpressApp.use(brandDetectionMiddleware);
adminExpressApp.use(brandDetectionMiddleware);

// Mount the routers for the public app
publicExpressApp.use("/api", apiRouter);
publicExpressApp.use("/", router);

// Mount the routers for the admin app
// Redirect / to /admin/login for convenience
adminExpressApp.get("/", (req, res) => res.redirect("/admin/login"));
adminExpressApp.use(
    "/admin",
    (req, res, next) => {
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        next();
    },
    adminRouter,
);
// Also mount adminRouter on root for admin.subdomains (e.g. admin.thefangfarm.com/login)
adminExpressApp.use(
    "/",
    (req, res, next) => {
        res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
        next();
    },
    adminRouter,
);

// Catch 404 and forward to error handler
const notFoundHandler = (req, res, next) => {
    const err = new Error("Not Found");
    err.status = 404;
    next(err);
};
publicExpressApp.use(notFoundHandler);
adminExpressApp.use(notFoundHandler);

// Global Error Handler
const errorHandler = (err, req, res, next) => {
    console.error(`[Global Error] ${req.method} ${req.path}:`, err);

    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || 500;

    if (req.accepts("html")) {
        res.status(status).render("error", {
            error: err.message || "An unexpected error occurred.",
            status: status,
        });
    } else {
        res.status(status).json({
            success: false,
            error: err.message || "Internal Server Error",
        });
    }
};
publicExpressApp.use(errorHandler);
adminExpressApp.use(errorHandler);

// Export the Express apps as Cloud Functions
export const publicApp = onRequest(publicExpressApp);
export const adminApp = onRequest(adminExpressApp);
