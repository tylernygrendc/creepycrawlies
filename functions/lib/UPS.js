export async function upsGetToken() {
    const url = process.env.MAIL_SERVICE === "allow"
            ? "https://onlinetools.ups.com/security/v1/oauth/token"
            : "https://wwwcie.ups.com/security/v1/oauth/token";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "x-merchant-id": process.env.UPS_ACCOUNT_NUMBER,
            Authorization: `Basic ${Buffer.from(`${process.env.UPS_USERNAME}:${process.env.UPS_PASSWORD}`).toString("base64")}`,
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
        }),
    });

    return (await response.json()).access_token;
}

function upsPayload(details) {
    return {
        RateRequest: {
            Request: {
                TransactionReference: {
                    CustomerContext: "CustomerContext", // TODO this can be any string
                },
            },
            Shipment: {
                Shipper: {
                    Name: "ThePodPro",
                    ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
                    Address: {
                        AddressLine: ["ShipperAddressLine1", "ShipperAddressLine2"], // TODO update to match business
                        City: "",
                        StateProvinceCode: "TN",
                        PostalCode: "",
                        CountryCode: "US",
                    },
                },
                ShipTo: {
                    Name: details.display_name,
                    Address: {
                        AddressLine: [details.address_line_1, details.address_line_2],
                        City: details.locality,
                        StateProvinceCode: details.administrative_district_level_1,
                        PostalCode: details.postal_code,
                        CountryCode: details.country,
                    },
                },
                Service: {
                    Code: "03", // TODO confirm preferred service
                    Description: "Ground",
                },
                Package: {
                    // TODO confirm package types
                    SimpleRate: {
                        Description: "SimpleRateDescription",
                        Code: "XS",
                    },
                    PackagingType: {
                        Code: "02",
                        Description: "Packaging",
                    },
                    Dimensions: {
                        UnitOfMeasurement: {
                            Code: "IN",
                            Description: "Inches",
                        },
                        Length: "5",
                        Width: "5",
                        Height: "5",
                    },
                    PackageWeight: {
                        UnitOfMeasurement: {
                            Code: "LBS",
                            Description: "Pounds",
                        },
                        Weight: "1",
                    },
                },
            },
        },
    };
}

export async function upsGetQuote(details) {
    const url = "https://onlinetools.ups.com/api/rating/v2409/Rate";

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await upsGetToken()}`,
        },
        body: JSON.stringify(upsPayload(details)),
    });

    if (!response.ok) throw new Error(`UPS Quote Error: ${await response.text()}`);

    return parseFloat(
        (await response.json()).ShipmentResponse?.ShipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue || 0,
    );
}

export async function upsCreateLabel(details) {
    const url = "https://onlinetools.ups.com/api/shipments/v1/ship";

    const response = await fetch("https://onlinetools.ups.com/api/shipments/v1/ship", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "x-merchant-id": process.env.UPS_ACCOUNT_NUMBER,
        },
        body: JSON.stringify(upsPayload(details)),
    });

    if (!response.ok) throw new Error(`UPS Label Error: ${await response.text()}`);

    const data = await response.json();

    return {
        trackingNumber: data.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber,
        labelData: data.ShipmentResponse?.ShipmentResults?.PackageResults?.ShippingLabel?.GraphicImage, // raw Base64 string
    };
}
