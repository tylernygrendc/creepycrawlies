import { toast } from "./toast.mjs";

const buttonSyncOrders = document.getElementById(
    "button-sync-with-square-orders",
);

buttonSyncOrders.addEventListener("click", async (e) => {
    const response = await fetch("/admin/sync/orders", { method: "POST" });
    const { success, error } = await response.json();

    if (success) {
        toast("Success! Reloading in 3 seconds...");
        setTimeout(() => location.reload(), 3000);
    } else {
        console.error(error);
        toast("Failed to sync inventory with Square.");
    }
});
