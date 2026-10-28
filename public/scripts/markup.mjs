import DOMPurify from "dompurify";

export function el(attr = {}) {
    const el = document.createElement(attr.tagName ? attr.tagName : "div");
    if (!attr.id) el.id = crypto.randomUUID();
    for (const [key, val] of Object.entries(attr)) {
        switch (key) {
            case "aria":
                if (typeof val === "object" && !Array.isArray(val)) {
                    for (const [k, v] of Object.entries(val))
                        el.setAttribute(`aria-${k}`, v);
                } else {
                    console.warn("Expected object but recived:", val);
                }
                break;
            case "attributes":
                if (typeof val === "object" && !Array.isArray(val)) {
                    for (const [k, v] of Object.entries(val))
                        el.setAttribute(k, v);
                } else {
                    console.warn("Expected object but recived:", val);
                }
                break;
            case "children":
                if (Array.isArray(val)) {
                    for (const child of val)
                        if (
                            child instanceof Element ||
                            child instanceof DocumentFragment
                        )
                            el.append(child);
                } else {
                    console.warn("Expected array but recived:", val);
                }
                break;
            case "classList":
                if (Array.isArray(val)) {
                    for (const className of val) el.classList.add(className);
                } else {
                    console.warn("Expected array but recived:", val);
                }
                break;
            case "dataset":
                if (typeof val === "object" && !Array.isArray(val)) {
                    for (const [k, v] of Object.entries(val)) el.dataset[k] = v;
                } else {
                    console.warn("Expected object but recived:", val);
                }
                break;
            case "style":
                if (typeof val === "object" && !Array.isArray(val)) {
                    for (const [k, v] of Object.entries(val))
                        el.style[kebabCase(k)] = val;
                } else {
                    console.warn("Expected object but recived:", val);
                }
                break;
            default:
                el[key] = val;
                break;
        }
    }
    return el;
}

export function html(strings, ...values) {
    return strings.reduce((result, str, i) => {
        const val = values[i - 1];
        const escaped = String(val ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;")
            .replace(/`/g, "&#96;")
            .replace(/\//g, "&#x2F;");

        return result + escaped + str;
    });
}

export function safeString(strings, ...values) {
    const rawHtml = strings.reduce((acc, str, i) => {
        const val = values[i - 1];
        let formattedVal = "";

        if (val !== null && val !== undefined) {
            if (Array.isArray(val)) {
                // flatten arrays
                formattedVal = val.join("");
            } else {
                formattedVal = String(val);
            }
        }

        return acc + formattedVal + str;
    });

    return DOMPurify.sanitize(rawHtml, {
        SANITIZE_DOM: true,
    });
}

export function safeFragment(strings, ...values) {
    const rawHtml = strings.reduce((acc, str, i) => {
        const val = values[i - 1];
        let formattedVal = "";

        if (val !== null && val !== undefined) {
            if (Array.isArray(val)) {
                // flatten arrays
                formattedVal = val.join("");
            } else {
                formattedVal = String(val);
            }
        }

        return acc + formattedVal + str;
    });

    return DOMPurify.sanitize(rawHtml, {
        RETURN_DOM_FRAGMENT: true,
        SANITIZE_DOM: true,
    });
}
