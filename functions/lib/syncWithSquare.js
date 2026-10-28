import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import getSquareClient from "./squareClient.js";

export async function syncItems() {
    const db = getFirestore();
    try {
        // Retrieve all items and images from Square
        const response = await getSquareClient().catalog.list({
            types: "ITEM,IMAGE,CATEGORY",
        });
        const catalogObjects = [];
        for await (const obj of response) {
            catalogObjects.push(obj);
        }

        const itemsList = [];
        const imageMap = new Map();
        const categoryMap = new Map();
        const bucket = getStorage().bucket();

        for (const obj of catalogObjects) {
            // Process categories
            if (obj.type === "CATEGORY" && obj.categoryData?.name) {
                categoryMap.set(obj.id, obj.categoryData.name);
            }
            // Process images (download to Firebase Storage)
            if (obj.type === "IMAGE") {
                const squareTempUrl = obj.imageData?.url;
                let permanentUrl = "";

                if (squareTempUrl) {
                    try {
                        // Download the image buffer from Square's temporary link
                        const imgResponse = await fetch(squareTempUrl);
                        const arrayBuffer = await imgResponse.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);

                        // Define destination file path in Firebase Storage bucket
                        const file = bucket.file(
                            `catalog_images/${obj.id}.jpg`,
                        );

                        // Save image to Storage
                        await file.save(buffer, {
                            metadata: {
                                contentType:
                                    imgResponse.headers.get("content-type") ||
                                    "image/jpeg",
                                cacheControl: "public, max-age=31536000", // Cache for 1 year
                            },
                            public: true, // Makes the file publicly accessible via public URL
                        });

                        // Construct relative URL for the Firebase Hosting Proxy
                        permanentUrl = `/catalog_images/${obj.id}.jpg`;
                    } catch (err) {
                        console.error(
                            `Failed to process image ${obj.id}:`,
                            err,
                        );
                    }
                }

                imageMap.set(obj.id, {
                    id: obj.id,
                    url: permanentUrl, // Permanent hosted URL
                    caption: obj.imageData?.caption || "",
                });
            } else if (obj.type === "ITEM") {
                itemsList.push(obj);
            }
        }

        let batch = db.batch();
        let operationCount = 0;
        let syncedItems = 0;
        let syncedImages = imageMap.size;

        // Save image metadata to standalone "images" collection
        for (const [imageId, imageData] of imageMap.entries()) {
            const imageRef = db.collection("catalog_images").doc(imageId);
            batch.set(imageRef, imageData);
            operationCount++;

            if (operationCount >= 400) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
        }

        // Process items and attach permanent image URLs and categories
        for (const obj of itemsList) {
            const itemRef = db.collection("items").doc(obj.id);

            const categories = (obj.itemData.categories || []).map(
                (c) => categoryMap.get(c.id).toLowerCase() || "",
            );

            const variations = (obj.itemData.variations || []).map((v) => ({
                id: v.id,
                itemVariationData: {
                    name: v.itemVariationData.name || "",
                    sku: v.itemVariationData.sku || "",
                    priceMoney: {
                        amount:
                            Number(
                                v.itemVariationData?.priceMoney?.amount || 0,
                            ) / 100,
                        currency:
                            v.itemVariationData?.priceMoney?.currency || "USD",
                    },
                },
            }));

            // Resolve attached images using the permanent storage URLs in imageMap
            const imageIds = obj.itemData.imageIds || [];
            const images = imageIds
                .map((id) => imageMap.get(id))
                .filter(Boolean);

            // collect inventory counts and update variations
            // (Inventory is now handled separately by syncInventory)

            batch.set(itemRef, {
                name: obj.itemData.name,
                description: obj.itemData.description || "",
                categories: categories,
                variations: variations,
                imageIds: imageIds,
                images: images, // array with permanent Firebase image URLs
                primaryImage: images[0] || "", // Handy primary image object
                updatedAt: new Date(),
            });

            operationCount++;
            syncedItems++;

            if (operationCount >= 400) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }

        return {
            success: true,
            items: syncedItems,
            images: syncedImages,
        };
    } catch (error) {
        console.error("Failed to sync catalog items:", error);
        return { success: false, error: error };
    }
}

export async function syncInventory() {
    const db = getFirestore();
    try {
        // First get all items from Firestore to get variation IDs
        const catalogSnap = await db.collection("items").get();
        let variationIds = [];
        catalogSnap.forEach((doc) => {
            const item = doc.data();
            if (item.variations) {
                item.variations.forEach((v) => variationIds.push(v.id));
            }
        });

        if (variationIds.length === 0) {
            return { success: true, syncedCounts: 0 };
        }

        // Square batchRetrieveInventoryCounts limits catalogObjectIds to 1000 per request
        let syncedCounts = 0;
        let batch = db.batch();
        let operationCount = 0;

        for (let i = 0; i < variationIds.length; i += 1000) {
            const batchIds = variationIds.slice(i, i + 1000);
            const inventoryResponse =
                await getSquareClient().inventory.batchGetCounts({
                    catalogObjectIds: batchIds,
                });

            for await (const countData of inventoryResponse) {
                const invRef = db
                    .collection("inventory")
                    .doc(countData.catalogObjectId);
                batch.set(
                    invRef,
                    {
                        quantity: countData.quantity
                            ? parseInt(countData.quantity, 10)
                            : 0,
                        state: countData.state || "",
                        updatedAt: new Date(),
                    },
                    { merge: true },
                );

                operationCount++;
                syncedCounts++;

                if (operationCount >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    operationCount = 0;
                }
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }

        console.log(
            `Inventory sync complete: ${syncedCounts} variations updated.`,
        );
        return { success: true, syncedCounts };
    } catch (error) {
        console.error("Failed to sync inventory:", error);
        return { success: false, error: error };
    }
}

export async function syncOrders() {
    const db = getFirestore();
    try {
        const locationId = process.env.SQUARE_LOCATION_ID;

        if (!locationId) {
            console.error("SQUARE_LOCATION_ID is not set.");
            throw new Error("SQUARE_LOCATION_ID is not set.");
        }

        // exclude orders older than n days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 180);

        // sync orders from Square
        let cursor;
        let syncedOrders = 0;
        let batch = db.batch();
        let operationCount = 0;

        do {
            // order entries include only matching order ids
            const ordersResponse = await getSquareClient().orders.search({
                locationIds: [locationId],
                query: {
                    filter: {
                        dateTimeFilter: {
                            updatedAt: {
                                startAt: cutoffDate.toISOString(),
                            },
                        },
                        stateFilter: {
                            states: ["OPEN"],
                        },
                    },
                    sort: {
                        sortField: "CREATED_AT",
                        sortOrder: "DESC",
                    },
                },
                cursor: cursor,
            });

            // If there are no orders, break to allow purging to happen
            const orders = ordersResponse?.orders;
            if (!orders || orders.length === 0) {
                break;
            }

            for (const order of orders) {
                const orderRef = db.collection("orders").doc(order.id);
                batch.set(
                    orderRef,
                    {
                        ...order,
                        updatedAt: order.updatedAt
                            ? new Date(order.updatedAt)
                            : new Date(),
                    },
                    { merge: true },
                );

                operationCount++;
                syncedOrders++;

                if (operationCount >= 400) {
                    await batch.commit();
                    batch = db.batch();
                    operationCount = 0;
                }
            }

            cursor = ordersResponse.cursor;
        } while (cursor);

        // purge old orders from Firestore
        const oldOrdersSnap = await db
            .collection("orders")
            .where("updatedAt", "<", cutoffDate)
            .get();

        let purgedOrders = 0;
        for (const doc of oldOrdersSnap.docs) {
            batch.delete(doc.ref);
            operationCount++;
            purgedOrders++;

            if (operationCount >= 400) {
                await batch.commit();
                batch = db.batch();
                operationCount = 0;
            }
        }

        if (operationCount > 0) {
            await batch.commit();
        }

        console.log(
            `Order sync complete: ${syncedOrders} synced, ${purgedOrders} purged.`,
        );
        return { success: true };
    } catch (error) {
        console.error("Failed to sync orders:", error);
        return { success: false, error: error };
    }
}
