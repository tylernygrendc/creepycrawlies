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
