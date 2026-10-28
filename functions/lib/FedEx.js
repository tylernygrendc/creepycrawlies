async function fedexGetToken() {
    const url = "https://apis.fedex.com/oauth/token";

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.FEDEX_CLIENT_ID,
            client_secret: process.env.FEDEX_SECRET_KEY,
        }),
    });

    if (!response.ok) throw new Error(`FedEx OAuth failed: ${await response.text()}`);
    const data = await response.json();
    return data.access_token;
}

function fedexPayload(details) {
    return {
        accountNumber: {
            value: process.env.FEDEX_ACCOUNT_NUMBER,
        },
        requestedShipment: {
            shipper: {
                address: {
                    // TODO confirm business details
                    streetLines: [],
                    city: "",
                    stateOrProvinceCode: "TN",
                    postalCode: "",
                    countryCode: "US",
                },
                contact: {
                    personName: "", // TODO confirm sender
                    companyName: "ThePodPro",
                },
            },
            recipient: [
                {
                    address: {
                        streetLines: [details.address_line_1, details.address_line_2],
                        city: details.locality,
                        stateOrProvinceCode: details.administrative_district_level_1,
                        postalCode: details.postal_code,
                        countryCode: details.contry,
                    },
                    contact: {
                        personName: details.display_name,
                    },
                },
            ],
            serviceType: details.fedexServiceClass || "FEDEX_GROUND", // TODO confirm preferred service
            pickupType: "DROPOFF_AT_FEDEX_LOCATION",
            shippingChargesPayment: {
                paymentType: "SENDER",
            },
            requestedPackageLineItems: [
                {
                    weight: {
                        units: "LB",
                        value: details.package_weight,
                    },
                    dimensions: {
                        length: details.package_length,
                        width: details.package_width,
                        height: details.package_height,
                        units: "IN",
                    },
                },
            ],
        },
    };
}

async function getFedexQuote(details) {
    const url = "https://apis.fedex.com/rate/v1/rates/quotes";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await fedexGetToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(fedexPayload(details)),
    });

    if (!response.ok) throw new Error(`FedEx Quote Error: ${await response.text()}`);

    return parseFloat(
        (await response.json()).output?.rateReplyDetails?.[0]?.ratedShipmentDetails?.[0]?.totalNetCharge || 0,
    );
}

async function createFedexLabel(details) {
    const url = "https://apis.fedex.com/ship/v1/shipments";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${await fedexGetToken()}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            ...fedexPayload(details),
            labelSpecification: {
                imageType: "PDF",
                labelStockType: "PAPER_4X6",
            },
        }),
    });

    if (!response.ok) throw new Error(`FedEx Label Error: ${await response.text()}`);

    const data = (await response.json()).output?.transactionShipments?.[0];
    const rawBase64Image = data?.pieceResponses?.[0]?.packageDocuments?.[0]?.encodedImage;

    return {
        trackingNumber: data?.masterTrackingNumber,
        labelData: rawBase64Image ? `data:application/pdf;base64,${rawBase64Image}` : null,
    };
}
