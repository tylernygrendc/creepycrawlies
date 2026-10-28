import express from "express";
import { getAuth } from "firebase-admin/auth";
import * as square from "../lib/syncWithSquare.js";
import { getFirestore } from "firebase-admin/firestore";
import { capitalize } from "../lib/string.mjs";
import getSquareClient from "../lib/squareClient.js";

const router = express.Router();

// Auth Middleware
const requireAuth = async (req, res, next) => {
    const sessionCookie = req.cookies.session || "";
    try {
        const decodedClaims = await getAuth().verifySessionCookie(
            sessionCookie,
            true,
        );
        req.user = decodedClaims;
        next();
    } catch (error) {
        res.redirect("/admin/login");
    }
};

// Auth Routes
router.get("/login", (req, res) => {
    const sessionCookie = req.cookies.session || "";
    getAuth()
        .verifySessionCookie(sessionCookie, true)
        .then(() => res.redirect("/admin/dashboard/orders"))
        .catch(() => res.render("admin-login"));
});

router.post("/sessionLogin", async (req, res, next) => {
    const idToken = req.body.idToken;
    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    try {
        const sessionCookie = await getAuth().createSessionCookie(idToken, {
            expiresIn,
        });
        const options = { maxAge: expiresIn, httpOnly: true, secure: true };
        res.cookie("session", sessionCookie, options);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ success: false, error: "Unauthorized request" });
    }
});

router.get("/dashboard/:resource", requireAuth, async (req, res, next) => {
    try {
        const db = getFirestore();

        switch (req.params.resource) {
            case "orders": {
                // get orders
                let orders;
                const ordersSnapshot = await db.collection("orders").get();
                if (!ordersSnapshot.empty)
                    orders = ordersSnapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() || {}),
                    }));
                res.render("admin-orders", {
                    orders: orders || [],
                });
                break;
            }

            case "events": {
                // get events
                let events;
                const eventsSnapshot = await db.collection("events").get();
                if (!eventsSnapshot.empty)
                    events = eventsSnapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() || {}),
                    }));
                res.render("admin-events", {
                    events: events || [],
                });
                break;
            }

            case "catalog": {
                // get catalog items
                let items;
                const itemsSnapshot = await db.collection("items").get();
                if (!itemsSnapshot.empty)
                    items = itemsSnapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...(doc.data() || {}),
                    }));

                // append quantity to each catalog item variation
                await Promise.all(
                    (items || []).map(async (item) => {
                        const variationIds = (item.variations || []).map(
                            (v) => v.id,
                        );

                        if (variationIds.length > 0) {
                            const inventoryRefs = variationIds.map((id) =>
                                db.collection("inventory").doc(id),
                            );

                            const inventoryDocs = await db.getAll(
                                ...inventoryRefs,
                            );

                            inventoryDocs.forEach((snap) => {
                                if (snap.exists) {
                                    const targetVariation =
                                        item.variations.find(
                                            (v) => v.id === snap.id,
                                        );
                                    if (targetVariation) {
                                        targetVariation.quantity =
                                            snap.data().quantity;
                                    }
                                }
                            });
                        }
                    }),
                );

                res.render("admin-catalog.ejs", {
                    items: items || [],
                });
                break;
            }

            default:
                res.status(404).render("404.ejs");
                break;
        }
    } catch (error) {
        next(error);
    }
});

router.post("/sync/:collection", requireAuth, async (req, res, next) => {
    try {
        const collection = req.params.collection;
        const validCollections = ["inventory", "items", "orders"];
        if (collection && validCollections.includes(collection)) {
            res.json(await square[`sync${capitalize(collection)}`]());
        } else {
            res.json({
                success: false,
                error: `sync${capitalize(collection)}() does not exist on * from syncWithSquare.js.`,
            });
        }
    } catch (error) {
        next(error);
    }
});

router.post("/items/upsert", requireAuth, async (req, res, next) => {
    try {
        const itemInput = req.body?.item;
        const changesInput = req.body?.changes;

        if (!itemInput?.id) {
            return res
                .status(400)
                .json({ success: false, error: "Missing item ID." });
        }

        // Fetch existing item from Square to preserve type, versions, and structure
        const squareResponse = await getSquareClient().catalog.object.get({
            objectId: itemInput.id,
        });

        const existingObject = squareResponse.object;
        if (!existingObject || existingObject.type !== "ITEM") {
            return res.status(404).json({
                success: false,
                error: "Catalog item not found on Square.",
            });
        }

        // Update item name
        if (itemInput.name && existingObject.itemData) {
            existingObject.itemData.name = itemInput.name;
        }

        // Update variations
        if (
            Array.isArray(itemInput.variations) &&
            existingObject.itemData?.variations
        ) {
            for (const vInput of itemInput.variations) {
                const existingVar = existingObject.itemData.variations.find(
                    (v) => v.id === vInput.id,
                );
                if (existingVar && existingVar.itemVariationData) {
                    if (vInput.name) {
                        existingVar.itemVariationData.name = vInput.name;
                    }
                    if (vInput.priceMoney?.amount !== undefined) {
                        existingVar.itemVariationData.priceMoney = {
                            amount: BigInt(
                                Math.round(Number(vInput.priceMoney.amount)),
                            ),
                            currency:
                                existingVar.itemVariationData.priceMoney
                                    ?.currency || "USD",
                        };
                    }
                }
            }
        }

        // Upsert catalog item on Square
        await getSquareClient().catalog.object.upsert({
            idempotencyKey: crypto.randomUUID(),
            object: existingObject,
        });

        // Batch update inventory changes if variations have quantities
        if (Array.isArray(changesInput) && changesInput.length > 0) {
            const validChanges = changesInput
                .filter(
                    (change) =>
                        change?.physicalCount?.catalogObjectId &&
                        change?.physicalCount?.quantity !== undefined &&
                        change?.physicalCount?.quantity !== "",
                )
                .map((change) => ({
                    type: "PHYSICAL_COUNT",
                    physicalCount: {
                        catalogObjectId: change.physicalCount.catalogObjectId,
                        locationId: process.env.SQUARE_LOCATION_ID,
                        state: change.physicalCount.state || "IN_STOCK",
                        quantity: String(change.physicalCount.quantity),
                        occurredAt: new Date().toISOString(),
                    },
                }));

            if (validChanges.length > 0) {
                await getSquareClient().inventory.batchCreateChanges({
                    idempotencyKey: crypto.randomUUID(),
                    changes: validChanges,
                });
            }
        }

        // Update pickupOnly and inStoreOnly
        const db = getFirestore();
        const updatePayload = {};
        if (itemInput.pickupOnly !== undefined) {
            updatePayload.pickupOnly =
                itemInput.pickupOnly === true ||
                itemInput.pickupOnly === "true";
        }
        if (itemInput.inStoreOnly !== undefined) {
            updatePayload.inStoreOnly =
                itemInput.inStoreOnly === true ||
                itemInput.inStoreOnly === "true";
        }
        if (Object.keys(updatePayload).length > 0) {
            await db
                .collection("items")
                .doc(itemInput.id)
                .set(updatePayload, { merge: true });
        }
        // Square Webhooks will sync the rest

        return res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

router.post("/events/upsert", requireAuth, async (req, res, next) => {
    if (req.body.id) {
        // parse dates
        if (req.body.startDate) {
            req.body.startDate = new Date(req.body.startDate);
            // startDate must be valid
            if (isNaN(req.body.startDate.getTime()))
                throw new Error("Invalid event startDate");
        }

        if (req.body.endDate) {
            req.body.endDate = new Date(req.body.endDate);
            // startDate must be valid
            if (isNaN(req.body.startDate.getTime()))
                throw new Error("Invalid event endDate");
        }

        await getFirestore()
            .collection("events")
            .doc(req.body.id)
            .set(req.body, { merge: true });
        res.status(201).send({ success: true });
    } else {
        throw new Error("Invalid firestore document id.");
    }
});

router.get("/logout", (req, res) => {
    res.clearCookie("session");
    res.redirect("/admin/login");
});

export default router;
