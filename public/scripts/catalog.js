import Fuse from "fuse.js/min";

const catalogList = document.getElementById("catalog-list");

const catalog =
    JSON.parse(document.getElementById("catalog-json").textContent) || "[{}]";

// allow catalog search

const fuse = new Fuse(catalog, {
    keys: ["name", "variations.itemVariationData.name", "categories.name"],
    includeScore: true,
    useTokenSearch: true,
});

const debounce = (callback, delay) => {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            callback.apply(this, args);
        }, delay);
    };
};

const filterForm = document.getElementById("catalog-filter-form");

const handleSearch = debounce(() => {
    const query = Array.from(new FormData(filterForm).values())
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter((value) => value !== "")
        .join(" ");

    if (!query) {
        catalogList
            .querySelectorAll("li.catalog-item")
            .forEach((item) => item.removeAttribute("hidden"));
        return;
    }

    // rank items by query match
    const results = fuse.search(query);

    // hide items before sorting by rank
    catalogList
        .querySelectorAll("li.catalog-item")
        .forEach((item) => item.setAttribute("hidden", ""));

    if (results.length) {
        // map catalog items
        const itemMap = {};
        for (const li of catalogList.children) {
            if (li.id) itemMap[li.id] = li;
        }
        // reorder
        results.forEach((result) => {
            if (itemMap[result.item.id] instanceof Element) {
                itemMap[result.item.id].removeAttribute("hidden");
                catalogList.append(itemMap[result.item.id]);
            }
        });
    }
}, 500);

filterForm.addEventListener("input", handleSearch);

filterForm.addEventListener("submit", (e) => {
    e.preventDefault();
});
