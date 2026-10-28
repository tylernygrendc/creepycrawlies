/**
 * Generates an iCalendar (.ics) string representation of an event.
 *
 * @param {Object} event - The event details.
 * @param {Date} event.start - The starting date and time of the event.
 * @param {Date} event.end - The ending date and time of the event.
 * @param {string} [event.title] - The title or summary of the event.
 * @param {string} [event.description] - The description of the event.
 * @param {string} [event.location] - The location of the event.
 * @returns {string} The formatted iCalendar data string.
 */
function generateICS(event) {
    // Helper to format dates to YYYYMMDDTHHMMSSZ (UTC ISO standard)
    const formatDate = (date) => {
        return date.toISOString().replace(/-|:|\.\d+/g, "");
    };

    const startTime = formatDate(event.start);
    const endTime = formatDate(event.end);
    const now = formatDate(new Date());

    // Escape special characters per iCalendar specification
    const escapeText = (str) => {
        return (str || "")
            .replace(/\\/g, "\\\\")
            .replace(/;/g, "\\;")
            .replace(/,/g, "\\,")
            .replace(/\n/g, "\\n");
    };

    // Build the iCalendar file content
    const icsData = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Your App Name//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        `UID:${now}-${Math.random().toString(36).substring(2)}@fang-farm.web.app`,
        `DTSTAMP:${now}`,
        `DTSTART:${startTime}`,
        `DTEND:${endTime}`,
        `SUMMARY:${escapeText(event.title)}`,
        `DESCRIPTION:${escapeText(event.description)}`,
        `LOCATION:${escapeText(event.location)}`,
        "STATUS:CONFIRMED",
        "END:VEVENT",
        "END:VCALENDAR",
    ].join("\r\n");

    // Create a Blob and trigger a file download
    const blob = new Blob([icsData], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
        "download",
        `${event.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.ics`,
    );
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
