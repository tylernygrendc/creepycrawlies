import { generateICS } from "./ics.mjs";
import { html, el } from "./markup.mjs";
import { toast } from "./toast.mjs";

document.getElementById("list-events").addEventListener("click", async (e) => {
    const buttonAddToCalendar = e.target.closest("button[data-event]");
    const buttonShareEvent = e.target.closest("button[data-share-url]");

    if (buttonAddToCalendar) {
        try {
            const event = JSON.parse(button.dataset.event);
            event.start = new Date(event.start._seconds * 1000);
            event.end = new Date(event.end._seconds * 1000);
            generateICS(event);
            button.innerHTML = html`<i class="icon">check</i> Added to Calendar`;
        } catch (error) {
            toast("Error: Could not add to calendar.");
            console.error(error);
        }
    } else if (buttonShareEvent) {
        const start = new Date(Number(buttonShareEvent.dataset.eventStart));
        const end = buttonShareEvent.dataset.eventEnd
            ? new Date(Number(buttonShareEvent.dataset.eventEnd))
            : undefined;
        const dates = (() => {
            if (start && end) {
                if (start.getMonth() === end.getMonth()) {
                    return `${start.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        date: "numeric",
                    })} - ${end.getDate()}`;
                } else {
                    return `${start.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        date: "numeric",
                    })} - ${end.toLocaleDateString("en-US", {
                        month: "short",
                        date: "numeric",
                    })}`;
                }
            } else {
                return start.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    date: "numeric",
                });
            }
        })();

        const shareData = {
            text: `Checkout this event! The Fang Farm will be at ${buttonShareEvent.dataset.eventTitle} ${dates}!`,
            url: buttonShareEvent.dataset.shareUrl,
        };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (error) {
                // ignore user cancel
                if (error.name !== "AbortError") {
                    toast(error?.message || error);
                    console.error(error);
                }
            }
        } else {
            window.location.href = `sms:?body=${encodeURIComponent(
                `${shareData.text}\n\n${shareData.url}`,
            )}`;
        }
    }
});
