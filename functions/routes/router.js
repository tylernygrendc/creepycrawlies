import express from "express";
import { getFirestore } from "firebase-admin/firestore";

const router = express.Router();

router.use((req, res, next) => {
    console.log(`[Router Request]: ${req.method} ${req.path}`);
    next();
});

router.get("/", async (req, res) => {
    try {
        res.set(
            "Cache-Control",
            "public, max-age=0, s-maxage=86400, stale-while-revalidate=600",
        ); // updates daily
        res.render("index", {
            featuredItems: [],
        });
    } catch (error) {
        next(error);
    }
});

router.get("/catalog/item/:itemId", async (req, res, next) => {
    try {
        // get item
        const docSnapshot = await getFirestore()
            .collection("items")
            .doc(req.params.itemId)
            .get();

        if (!docSnapshot.exists) {
            return res.status(404).send("Item not found.");
        }

        const item = {
            id: docSnapshot.id,
            ...(docSnapshot.data() || {}),
        };

        const variationIds = (item.variations || []).map((v) => v.id);

        if (variationIds.length > 0) {
            const inventoryRefs = variationIds.map((id) =>
                getFirestore().collection("inventory").doc(id),
            );

            const inventoryDocs = await getFirestore().getAll(...inventoryRefs);

            inventoryDocs.forEach((snap) => {
                if (snap.exists) {
                    const targetVariation = item.variations.find(
                        (v) => v.id === snap.id,
                    );
                    if (targetVariation) {
                        targetVariation.quantity = snap.data().quantity;
                    }
                }
            });
        }

        // get related up to 10 related items
        const relatedItemsSnapshot = await getFirestore()
            .collection("items")
            .where("categories", "array-contains-any", item.categories)
            .limit(10)
            .get();

        const relatedItems = relatedItemsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() || {}),
        }));

        res.set(
            "Cache-Control",
            "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
        ); // updates every 10 minutes
        res.render("catalog-item", {
            item: item,
            relatedItems: relatedItems,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/catalog{/:categoryName}", async (req, res, next) => {
    try {
        let query = getFirestore().collection("items");

        const categoryName = req.params?.categoryName
            ? decodeURIComponent(req.params.categoryName)
            : undefined;

        if (categoryName) {
            query = query.where(
                "categories",
                "array-contains",
                decodeURIComponent(req.params.categoryName),
            );
        }

        const itemsSnapshot = await query.get();

        const items = itemsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() || {}),
        }));

        res.set(
            "Cache-Control",
            "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
        ); // updates every 10 minutes
        res.render("catalog", {
            categoryName: categoryName,
            items: items,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/checkout", async (req, res) => {
    res.render("checkout");
});

router.get("/confirmation/:orderId", async (req, res) => {
    const orderSnapshot = await getFirestore()
        .collection("events")
        .doc(req.params.orderId)
        .get();
    const order = {
        id: orderSnapshot.id,
        ...(orderSnapshot.data() || {}),
    };
    res.set(
        "Cache-Control",
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=600",
    ); // updates daily
    res.render("confirmation", {
        order: order,
    });
});

router.get("/events", async (req, res, next) => {
    try {
        const eventsSnapshot = await getFirestore()
            .collection("events")
            .where("endDate", ">", new Date().setDate(new Date().getDate() - 2))
            .get();
        const events = eventsSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...(doc.data() || {}),
        }));
        events.map((event) => {
            item.schema = JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Event",
                name: event.name,
                startDate: event.startDate,
                endDate: event.endDate,
                eventAttendanceMode:
                    event.attendanceMode || "https://schema.org",
                eventStatus: "https://schema.org",
                location: {
                    "@type": "Place",
                    name: event.venueName,
                    address: {
                        "@type": "PostalAddress",
                        streetAddress: event.street,
                        addressLocality: event.city,
                        addressRegion: event.state,
                        postalCode: event.zip,
                        addressCountry: event.country || "US",
                    },
                },
                description: event.description,
                organizer: {
                    "@type": "Organization",
                    name: event.organizerName,
                    url: event.organizerUrl,
                },
                attendee: {
                    "@type": "Organization",
                    name: event.vendorName,
                    url: event.vendorUrl,
                    image: event.vendorLogo,
                },
            });
        });
        res.set(
            "Cache-Control",
            "public, max-age=0, s-maxage=86400, stale-while-revalidate=600",
        ); // updates daily
        res.render("events", {
            events: events,
        });
    } catch (error) {
        next(error);
    }
});

router.get("/events/:eventId", async (req, res, next) => {
    try {
        const eventSnapshot = await getFirestore()
            .collection("events")
            .doc(req.params.eventId)
            .get();
        const event = {
            id: eventSnapshot.id,
            ...(eventSnapshot.data() || {}),
        };
        res.set(
            "Cache-Control",
            "public, max-age=0, s-maxage=86400, stale-while-revalidate=600",
        ); // updates daily
        res.render("event", {
            event: event,
        });
    } catch (error) {
        next(error);
    }
});

export default router;
