import { toast } from "./toast.mjs";

const itemId = location.pathname.split("/")[3];

// store this in viewed-items
(() => {
    // get up to 9 recent items
    const viewedItems = JSON.parse(
        localStorage.getItem("viewedItems") || "[]",
    ).slice(0, 10);
    // prepend the current item
    if (itemId) {
        // avoid duplicates
        localStorage.setItem(
            "viewedItems",
            JSON.stringify([...new Set([itemId, ...viewedItems])]),
        );
    }
})();

const form = document.getElementById("form-add-to-cart");
const shownPrice = document.getElementById("shown-price");

const variationSelector = document.getElementById("select-variation");

variationSelector.addEventListener("change", (e) => {
    const selectedVariation = variationSelector.querySelector(
        `option[value="${e.target.value}"]`,
    );

    // update displayed price
    shownPrice.value = selectedVariation.dataset?.price || "";
    shownPrice.textContent = `$${selectedVariation.dataset?.price}` || "Varies";

    // update hidden input fields
    Object.entries({ ...selectedVariation.dataset }).forEach(
        ([name, value]) => {
            console.log(name, value);
            const hiddenInput = form.querySelector(`input[name="${name}"]`);
            if (hiddenInput) hiddenInput.value = value;
        },
    );
});

const quantityComponent = document.getElementById("component-quantity");
const inputQuantity = document.getElementById("input-quantity");
const buttonAddToCart = document.getElementById("button-add-to-cart");

// reflect item already added to cart
(() => {
    const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");
    const existingCartEntry = cartItems.find((item) => item.id === itemId);
    if (existingCartEntry) {
        buttonAddToCart.innerText = "Added to Cart";
        buttonAddToCart.setAttribute("disabled", "");
        toast("This item is already in your cart.");
    }
})();

// listen for changes to quantity

quantityComponent.addEventListener("click", (e) => {
    if (e.target.id === "decrement-input-quantity") {
        inputQuantity.value = Number(inputQuantity.value) - 1;
    }
    if (e.target.id === "increment-input-quantity") {
        inputQuantity.value = Number(inputQuantity.value) + 1;
    }
});

form.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const cartItems = JSON.parse(localStorage.getItem("cartItems") || "[]");
    const existingCartItem = cartItems.find(
        (item) => item.variationId === data.variationId,
    );
    if (existingCartItem) {
        existingCartItem.quantity =
            Number(existingCartItem.quantity) + Number(data.quantity);
    } else {
        cartItems.push(data);
    }
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
    buttonAddToCart.innerText = "Added to Cart";
    buttonAddToCart.setAttribute("disabled", "");
    toast("Item added to cart!");
});
