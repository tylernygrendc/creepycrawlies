import { toast } from "./toast.mjs";

const buttonSyncItems = document.getElementById(
    "button-sync-with-square-items",
);

buttonSyncItems.addEventListener("click", async (e) => {
    const response = await fetch("/admin/sync/items", { method: "POST" });
    const { success, error } = await response.json();

    if (success) {
        const response = await fetch("/admin/sync/inventory", {
            method: "POST",
        });
        const { success, error } = await response.json();
        if (success) {
            toast("Success! Reloading in 3 seconds...");
        } else {
            console.error(error);
            toast("Failed to sync inventory with Square.");
        }
    } else {
        console.error(error);
        toast("Failed to sync orders with Square.");
    }
});

const listCatalogItems = document.getElementById("list-catalog-items");
listCatalogItems.addEventListener("change", async (e) => {
    if (e.target.classList.contains("td-variation")) {
        const variation = e.target.closest("tr");
        if (variation) variation.dataset[e.target.name] = e.target.value;
    } else {
        const item = e.target.closest("li");
        if (item) {
            if (e.target.type === "checkbox") {
                item.dataset[e.target.name] = e.target.checked
                    ? "true"
                    : "false";
            } else {
                item.dataset[e.target.name] = e.target.value;
            }
        }
    }
});
listCatalogItems.addEventListener("click", async (e) => {
    try {
        const button = e.target.closest("button");
        if (
            button instanceof HTMLButtonElement &&
            button.classList.contains("button-update-item")
        ) {
            e.preventDefault();
            const item = button.closest("li");
            const variations = item.querySelectorAll("tbody tr");

            const itemData = {
                id: item.dataset.id,
                name: item.dataset.name,
                pickupOnly: item.dataset.pickupOnly === "true",
                inStoreOnly: item.dataset.inStoreOnly === "true",
                variations: [],
            };

            const inventoryChanges = [];

            variations.forEach((variation) => {
                const vData = { ...variation.dataset };
                const price = parseFloat(vData.price);
                if (vData.id) {
                    itemData.variations.push({
                        id: vData.id,
                        name: vData.name,
                        priceMoney: {
                            amount: isNaN(price) ? 0 : Math.round(price * 100),
                        },
                    });
                    if (vData.quantity !== undefined && vData.quantity !== "") {
                        inventoryChanges.push({
                            type: "PHYSICAL_COUNT",
                            physicalCount: {
                                catalogObjectId: vData.id,
                                quantity: String(vData.quantity),
                                state: "IN_STOCK",
                            },
                        });
                    }
                }
            });

            const response = await fetch("/admin/items/upsert", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify({
                    item: itemData,
                    changes: inventoryChanges,
                }),
            });

            const data = await response.json();
            if (response.ok && data.success) {
                toast("Item successfully updated!");
            } else {
                throw new Error(data.error || response.statusText);
            }
        }
    } catch (error) {
        console.error(error);
        toast(error.message || error);
    }
});
