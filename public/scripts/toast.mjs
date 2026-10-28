import { safeString } from "./markup.mjs";

const container = document.getElementById("toast");

export function toast(body) {
    if (!container) return;

    const nodeId = "ff" + Math.random().toString(36).substring(2);

    container.insertAdjacentHTML(
        "afterbegin",
        safeString`<div id="${nodeId}" class="toast-item">
            <span>${body}</span>
            <button type="button" aria-label="close notification">close</button>
        </div>`,
    );

    const toast = container.querySelector(`#${nodeId}`);

    const timer = setTimeout(() => {
        toast.remove();
    }, 6000);

    container.addEventListener("click", (e) => {
        if (e.target.getAttribute("aria-label") === "close notification") {
            e.target.parentElement.remove();
            clearTimeout(timer);
        }
    });
}
