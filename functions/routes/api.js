import express from "express";
import crypto from "crypto";
import { getFirestore } from "firebase-admin/firestore";
import getSquareClient from "../lib/squareClient.js";

const router = express.Router();

let cachedEvents = null;
let cachedEventsExpiry = 0;

export const getUpcomingEvents = async () => {
    const now = Date.now();
    // Use cached events if they exist and haven't expired
    if (cachedEvents && now < cachedEventsExpiry) {
        return cachedEvents;
    }

    const minStartDate = new Date();

    const eventSnapshot = await getFirestore()
        .collection("events")
        .where("startDate", ">", minStartDate)
        .get();

    cachedEvents = eventSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
    }));

    // cache
    cachedEventsExpiry = now + 60000;

    return cachedEvents;
};

router.get("/upcoming-events", async (req, res, next) => {
    try {
        const events = await getUpcomingEvents();
        res.set("Cache-Control", "public, max-age=86400");
        res.send(events);
    } catch (error) {
        next(error);
    }
});

router.post("/checkout", async (req, res, next) => {
    try {
        const locationId = process.env.SQUARE_LOCATION_ID;

        if (!req.body.cartItems) {
            throw new Error("Missing or invalid cart items.");
        }
        if (!locationId) {
            throw new Error("Square Location ID is missing from environment.");
        }

        const cartItems = req.body.cartItems.map((item) => {
            if (!item.variationId || !item.quantity) {
                throw new Error(
                    "Invalid: Items must have variationId and quantity.",
                );
            }
            return {
                catalogObjectId: item.variationId,
                quantity: String(item.quantity),
            };
        });

        const response = await getSquareClient().checkout.paymentLinks.create({
            idempotencyKey: crypto.randomUUID(),
            order: {
                locationId: locationId,
                lineItems: cartItems,
            },
            checkoutOptions: {
                askForShippingAddress: req.body.method !== "pickup",
                redirectUrl: "https://fang-farm.web.app/confirmation",
            },
        });

        if (!response?.paymentLink) {
            throw new Error("paymentLink is undefined.");
        }

        res.json({
            success: true,
            ...response.paymentLink,
        });

        await getFirestore()
            .collection("orders")
            .doc(response.orderId)
            .set({
                ...response.relatedResources.orders[0],
                fuilfillmentMethod: req.body.method,
                pickupLocation: req.body.pickup || null,
                updatedAt: new Date(),
            });
    } catch (error) {
        next(error);
    }
});

router.post("/webhooks/square", async (req, res, next) => {
    const event = req.body;

    try {
        // 1. Handle Stock Shifts (sold in-store, restocked, etc.)
        if (event.type === "inventory.count.updated") {
            const counts = event.data?.object?.inventory_counts || [];

            for (const count of counts) {
                const variationId = count.catalog_object_id;
                const newQuantity = parseInt(count.quantity, 10);

                await getFirestore()
                    .collection("inventory")
                    .doc(variationId)
                    .set(
                        {
                            quantity: isNaN(newQuantity) ? 0 : newQuantity,
                            updatedAt: new Date(),
                        },
                        { merge: true },
                    );
            }
        }

        if (event.type === "catalog.version.updated") {
            const updatedObjectId =
                event.data?.object?.catalog_version?.object_id;

            if (updatedObjectId) {
                const response = await getSquareClient().catalog.object.get({
                    objectId: updatedObjectId,
                });

                const obj = response.object;
                if (obj) {
                    if (obj.type === "ITEM") {
                        const itemRef = getFirestore()
                            .collection("items")
                            .doc(obj.id);
                        const variations = (obj.itemData?.variations || []).map(
                            (v) => ({
                                id: v.id,
                                itemVariationData: {
                                    name: v.itemVariationData.name || "",
                                    sku: v.itemVariationData.sku || "",
                                    priceMoney: {
                                        amount:
                                            Number(
                                                v.itemVariationData?.priceMoney
                                                    ?.amount || 0,
                                            ) / 100,
                                        currency:
                                            v.itemVariationData?.priceMoney
                                                ?.currency || "USD",
                                    },
                                },
                            }),
                        );

                        const imageIds = obj.itemData?.imageIds || [];
                        let images = [];
                        if (imageIds.length > 0) {
                            const imageRefs = imageIds.map((id) =>
                                getFirestore()
                                    .collection("catalog_images")
                                    .doc(id),
                            );
                            const imageDocs = await getFirestore().getAll(
                                ...imageRefs,
                            );

                            images = imageDocs
                                .filter((doc) => doc.exists)
                                .map((doc) => doc.data());
                        }

                        const existingDoc = await itemRef.get();
                        const existingCategories = existingDoc.exists
                            ? existingDoc.data().categories
                            : [];

                        await itemRef.set(
                            {
                                name: obj.itemData.name,
                                description: obj.itemData.description || "",
                                categories: existingCategories,
                                variations: variations,
                                imageIds: imageIds,
                                images: images,
                                primaryImage: images[0] || "",
                                updatedAt: new Date(),
                            },
                            { merge: true },
                        );
                    }
                }
            }
        }

        if (event.type === "order.updated") {
            const orderId = event.data?.object?.order_updated?.order_id;
            if (orderId) {
                const response =
                    await getSquareClient().orders.retrieveOrder(orderId);
                const order = response.order;
                if (order) {
                    await getFirestore()
                        .collection("orders")
                        .doc(orderId)
                        .set(
                            {
                                ...order,
                                updatedAt: new Date(),
                            },
                            { merge: true },
                        );
                }
            }
        }

        // Always send a 200 OK fast so Square knows we got it
        res.status(200).send("Webhook received.");
    } catch (error) {
        next(error);
    }
});

export default router;
