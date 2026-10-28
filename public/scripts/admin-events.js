import { toast } from "./toast.mjs";
import { el } from "./markup.mjs";

const buttonAddEvent = document.getElementById("button-add-event");
const dialogEventEditor = document.getElementById("dialog-event-editor");
const formEventEditor = document.getElementById("form-event-editor");

buttonAddEvent.addEventListener("click", (e) => {
    e.preventDefault();
    formEventEditor.querySelectorAll("input, textarea").forEach((input) => {
        input.setAttribute("value", "");
    });
    dialogEventEditor.showModal();
});

formEventEditor.addEventListener("submit", async (e) => {
    try {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(e.currentTarget));
        if (!formData.id) formData.id = crypto.randomUUID();
        const response = await fetch("/admin/events/upsert", {
            method: "post",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(formData),
        });
        if (response.ok) {
            const { success, error } = await response.json();
            if (success) {
                toast("Event saved!");

                const tr = document.getElementById(formData.id);

                const updatedEventData = tr
                    ? {
                          ...JSON.parse(tr.dataset.event),
                          ...formData,
                      }
                    : formData;

                // format dates
                if (updatedEventData.startDate) {
                    updatedEventData.startDate = new Date(
                        updatedEventData.startDate,
                    )
                        .toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        })
                        .replaceAll("/", "-");
                }
                if (updatedEventData.endDate) {
                    updatedEventData.endDate = new Date(
                        updatedEventData.endDate,
                    )
                        .toLocaleDateString("en-US", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                        })
                        .replaceAll("/", "-");
                }

                const rowData = [
                    "name",
                    "startDate",
                    "endDate",
                    "venueName",
                    "city",
                    "state",
                ].reduce((acc, cv, i, array) => {
                    acc.push(
                        el({
                            tagName: "td",
                            innerText: updatedEventData[cv],
                        }),
                    );
                    if (i === array.length - 1)
                        acc.push(
                            el({
                                tagName: "button",
                                classList: ["icon"],
                                aria: { label: "edit event" },
                                innerText: "edit",
                            }),
                        );
                    return acc;
                }, []);
                rowData.push();

                if (tr) {
                    tr.replaceChildren(...rowData);
                } else {
                    tbodyEvents.prepend(
                        el({
                            tagName: "tr",
                            id: formData.id,
                            dataset: {
                                event: JSON.stringify(formData),
                            },
                            children: rowData,
                        }),
                    );
                }
            } else {
                throw new Error(error);
            }
        } else {
            throw new Error(response.statusText);
        }
    } catch (error) {
        toast(error.message || error);
        console.error(error);
    } finally {
        dialogEventEditor.close();
    }
});

const tbodyEvents = document.getElementById("tbody-events");

tbodyEvents.addEventListener("click", (e) => {
    try {
        if (
            e.target.closest("button")?.getAttribute("aria-label") ===
            "edit event"
        ) {
            e.preventDefault();
            const tr = e.target.closest("tr");
            if (!tr) {
                throw new Error("Failed to access table row.");
            }
            const eventData = JSON.parse(tr.dataset.event || "{}");
            if (!Object.keys(eventData)?.length) {
                throw new Error("Invalid event data.");
            }
            formEventEditor.reset();
            const formElements = formEventEditor.elements;

            Object.entries(eventData).forEach(([key, value]) => {
                if (formElements[key] instanceof HTMLElement) {
                    formElements[key].setAttribute(
                        "value",
                        (() => {
                            if (
                                /^(0?[1-9]|1[0-2])([\/\-])(0?[1-9]|[12]\d|3[01])\2\d{4}$/.test(
                                    value,
                                )
                            ) {
                                // format date shaped strings
                                return new Date(value)
                                    .toISOString()
                                    .split("T")[0];
                            } else {
                                return value;
                            }
                        })(),
                    );
                }
            });

            dialogEventEditor.showModal();
        }
    } catch (error) {
        console.error(error);
        toast("An error occurred.");
    }
});
