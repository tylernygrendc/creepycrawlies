import { html, safeFragment } from "./markup.mjs";
import { toast } from "./toast.mjs";

// the cart is a form wrapped in a dialog
const dialog = document.getElementById("cart-dialog");
const form = document.getElementById("cart-form");

export function updateCartCountBadge() {
    const cartButton = document.getElementById("button-show-cart");
    const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");
    if (cartButton) cartButton.setAttribute("data-badge", cartItems.length);
    return cartItems;
}

const syncStorageFromCart = () => {
    const cartItems = [];
    const tbody = document.getElementById("cart-items");
    tbody.querySelectorAll("tr").forEach((item) => {
        cartItems.push({ ...item.dataset });
    });
    // store the updated cart
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
    updateCartCountBadge();
};

const buildCartFromStorage = () => {
    const tbody = document.getElementById("cart-items");
    // get cart items
    const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");

    // clear exisitng items
    tbody.innerHTML = "";

    if (cartItems.length) {
        cartItems.forEach((item) => {
            tbody.insertAdjacentHTML(
                "beforeend",
                html`
                    <tr
                        data-id="${item.id}"
                        data-variation-id="${item.variationId}"
                        data-name="${item.name}"
                        data-variation-name="${item.variationName}"
                        data-price="${item.price}"
                        data-quantity="${item.quantity}"
                    >
                        <td>
                            <span>${item.name}</span>
                            <span>${item.variationName}</span>
                        </td>
                        <td>
                            <input
                                class="form-control"
                                type="number"
                                name="quantity"
                                value="${item.quantity}"
                            />
                        </td>
                        <td>
                            <output>
                                ${(
                                    Number(item.price) * Number(item.quantity)
                                ).toFixed(2)}
                            </output>
                        </td>
                        <td>
                            <button
                                type="button"
                                class="btn btn-text icon remove-cart-item"
                                aria-label="remove item"
                            >
                                delete
                            </button>
                        </td>
                    </tr>
                `,
            );
        });
        const alert = document.getElementById("pickup-only-alert");
        if (alert && cartItems.some((item) => item.pickupOnly))
            alert.removeAttribute("hidden");
        else alert.setAttribute("hidden", "");
    } else {
        // handle empty cart
        tbody.innerHTML = html`
            <tr>
                <td colspan="4">Your cart is empty.</td>
            </tr>
        `;
        document
            .querySelector("#cart-form button[type=reset]")
            .setAttribute("disabled", "");
    }
};

const checkout = (cartItems, formData) => {
    cartItems = cartItems.map(({ variationId, quantity }) => ({
        variationId,
        quantity,
    }));

    fetch("/api/checkout", {
        method: "post",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({
            cartItems: cartItems,
            ...formData,
        }),
    })
        .then((response) => {
            if (response.ok) {
                response.json().then((data) => {
                    if (data.success) {
                        location.href = data.url;
                    } else {
                        throw new Error(data.error);
                    }
                });
            } else {
                throw new Error(response.statusText);
            }
        })
        .catch((error) => {
            toast(`Checkout Error: ${error?.message || error}`);
            console.error(error);
        });
};

const embedPickupOptions = async () => {
    const formContent = document.getElementById("dynamic-form-content");
    if (!formContent) {
        console.error("Could not access #formContent element.");
        return;
    }
    // add form content
    formContent.innerHTML = html`
        <fieldset id="pickup-options">
            <legend>Please schedule your in-person pickup.</legend>
            <label>
                <div class="place">In Store - Charleston, TN</div>
                <div class="time">Pickup during store hours.</div>
                <input type="radio" name="pickup" value="store" required />
            </label>
            <progress
                id="load-events-progress"
                aria-label="loading upcoming events"
                max="100"
            ></progress>
        </fieldset>
    `;
    // load upcoming events
    const response = await fetch("/api/upcoming-events");
    document.getElementById("load-events-progress").replaceWith(
        ...(await response.json()).map((event) => {
            const dates = (() => {
                let start = Number(event?.startDate?._seconds);
                start = isNaN(start)
                    ? undefined
                    : new Date(start * 1000).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                      });
                let end = Number(event?.endDate?._seconds);
                end = isNaN(end)
                    ? undefined
                    : new Date(end * 1000).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                      });
                if (start && end)
                    return `${start} - ${end} during event hours.`;
                else if (start && !end) return `${start} during event hours.`;
                else return "During event hours.";
            })();
            return safeFragment`
                <label>
                    <div class="place">${event.name} - ${event.city}, ${event.state}</div>
                    <div class="time">${dates}</div>
                    <input type="radio" name="pickup" value="${event.id}" />
                </label>
            `;
        }),
    );
};

onload = () => {
    updateCartCountBadge();
    // set form content to default
    form.innerHTML = html`
        <div id="dynamic-form-content">
            <table>
                <caption>
                    Cart
                </caption>
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Quanitity</th>
                        <th>Price</th>
                        <th aria-label="action"></th>
                    </tr>
                </thead>
                <tbody id="cart-items"></tbody>
                <tfoot>
                    <tr>
                        <td colspan="2">Subtotal</td>
                        <td><output id="cart-subtotal"></output></td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <fieldset>
                <legend>How would you like to recive your order?</legend>
                <div>
                    <strong id="pickup-only-alert" hidden
                        >Some items must be picked up.</strong
                    >
                </div>
                <label>
                    <span>UPS Shipment</span>
                    <input
                        type="radio"
                        name="method"
                        value="shipment"
                        required
                    />
                </label>
                <label>
                    <span>In-Person Pickup</span>
                    <input type="radio" name="method" value="pickup" />
                </label>
            </fieldset>
        </div>
        <button id="checkout" class="btn btn-accent" type="submit">
            Checkout
        </button>
    `;

    const tbody = document.getElementById("cart-items");

    // handle changes to cart
    tbody.addEventListener("change", (e) => {
        if (e.target.name === "quantity") {
            e.target.closest("tr").dataset.quantity = e.target.value;

            // store the updated cart
            syncStorageFromCart();
            // then rebuild the cart
            buildCartFromStorage();
        }
    });

    tbody.addEventListener("click", (e) => {
        const button = e.target.closest("button");
        if (button.classList.contains("remove-cart-item")) {
            // remove the row
            button.closest("tr").remove();
            // store the updated cart
            syncStorageFromCart(e.currentTarget.closest("form"));
            // then rebuild the cart
            buildCartFromStorage();
        }
    });
};

dialog.addEventListener("command", (e) => {
    if (e.command === "show-modal") {
        buildCartFromStorage();
    }
});

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.currentTarget));
    const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");

    // handle empty cart
    if (!cartItems.length) {
        toast("Your cart is empty.");
        return;
    }

    // proceed to checkout if pickup is scheduled
    if (formData.pickup) {
        checkout(cartItems, formData);
    } else {
        // determine fulfillment method
        const method = (() => {
            if (formData.method === "pickup") return "pickup";
            // some items must be picked up
            if (cartItems.some((item) => item.pickupOnly)) {
                if (cartItems.every((item) => item.pickupOnly)) return "pickup";
                else return "mixed"; // mixed if some items can be shipped
            } else {
                return "shipment";
            }
        })();

        switch (method) {
            case "shipment":
                // or if no pickup is needed
                checkout(cartItems, formData);
            case "mixed":
            case "pickup":
                await embedPickupOptions();
        }
    }
});
