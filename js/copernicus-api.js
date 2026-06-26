const CLIENT_ID = "1544231e-f2be-4d84-b16a-9b5d78a17c48";
const CLIENT_SECRET = "H80qoLJJGDagpMy3ekNNxZ6QkYIhebfo";

let accessToken = null;

async function getAccessToken() {

    if (accessToken) {
        return accessToken;
    }

    const body =
        `grant_type=client_credentials` +
        `&client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;

    const response = await fetch(
        "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
            },
            body: body
        }
    );

    if (!response.ok) {
        throw new Error("Nu s-a putut obține token-ul.");
    }

    const data = await response.json();
    accessToken = data.access_token;

    return accessToken;
}

async function searchSentinelProducts(intersectsGeometry) {
    const token = await getAccessToken();
    
    const response = await fetch(
        "https://services.sentinel-hub.com/api/v1/catalog/search",
        {
            method: "POST",

            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                collections: [
                    "sentinel-2-l2a"
                ],
                limit: 10,
                intersects: intersectsGeometry,
                datetime:
                    "2024-01-01T00:00:00Z/2025-12-31T23:59:59Z"

            })
        }
    );

    if (!response.ok) {
        throw new Error("Eroare la interogarea Sentinel Hub.");
    }

    const result = await response.json();

    return result.features;
}