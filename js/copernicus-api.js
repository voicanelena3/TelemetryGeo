const CLIENT_ID = "e4214c35-0039-4bbb-a0c3-1a63329accd1";
const CLIENT_SECRET = "AkvWMNBMjOUTiuHli4UevHuVRm92AGSi";

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;

    const response = await fetch(
        "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token",
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: body
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error("Eroare la token:", errText);
        throw new Error("Nu s-a putut obtine token-ul.");
    }

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return accessToken;
}


//Colectia de scripturi personalizate Evalscript executate direct pe infrastructura cloud Sentinel Hub
const EVALSCRIPTS = {

    b02: `//VERSION=3
function setup() {
    return { input: ["B02"], output: { bands: 1, sampleType: "AUTO" } };
}
function evaluatePixel(sample) {
    return [sample.B02 * 3.5];
}`,

   
    truecolor: `//VERSION=3
function setup() {
    return { input: ["B02","B03","B04"], output: { bands: 3, sampleType: "AUTO" } };
}
function evaluatePixel(sample) {
    return [sample.B04 * 3.5, sample.B03 * 3.5, sample.B02 * 3.5];
}`,

    
    falsecolor: `//VERSION=3
function setup() {
    return { input: ["B03","B04","B08"], output: { bands: 3, sampleType: "AUTO" } };
}
function evaluatePixel(sample) {
    return [sample.B08 * 2.5, sample.B04 * 2.5, sample.B03 * 2.5];
}`,

    
    ndvi: `//VERSION=3
function setup() {
    return { input: ["B04","B08"], output: { bands: 3, sampleType: "AUTO" } }; // FIXED: Changed FLOAT32 to AUTO
}
function evaluatePixel(sample) {
    let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-10);
    ndvi = Math.max(-1, Math.min(1, ndvi));
    if (ndvi < -0.2) return [0.05, 0.05, 0.55];       // apa - albastru
    if (ndvi < 0.0)  return [0.85, 0.15, 0.05];       // sol gol - rosu
    if (ndvi < 0.2)  return [0.95, 0.85, 0.05];       // vegetatie slaba - galben
    if (ndvi < 0.4)  return [0.35, 0.80, 0.15];       // vegetatie moderata - verde deschis
    return [0.05, 0.50, 0.05];                         // vegetatie densa - verde inchis
}`,


    ndvi_analysis: `//VERSION=3
function setup() {
    return { input: ["B04","B08"], output: { bands: 1, sampleType: "AUTO" } };
}
function evaluatePixel(sample) {
    let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04 + 1e-10);
    return [(ndvi + 1) / 2];
}`
};

async function fetchSentinelImage(bbox, dateFrom, dateTo, width, height, evalscript) {
    const token = await getAccessToken();

    const usedEvalscript = evalscript || EVALSCRIPTS.b02;

    const requestBody = {
        input: {
            bounds: {
                bbox: bbox,
                properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" }
            },
            data: [{
                type: "sentinel-2-l1c",
                dataFilter: { timeRange: { from: dateFrom, to: dateTo } }
            }]
        },
        output: {
            width: width,
            height: height,
            responses: [{ identifier: "default", format: { type: "image/png" } }]
        },
        evalscript: usedEvalscript
    };

    const response = await fetch(
        "https://services.sentinel-hub.com/process/v1",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error(`Eroare Process API: ${response.status}`, errText);
        throw new Error(`Eroare la generarea imaginii. Status: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}



async function searchSentinelProducts(intersectsGeometry, dateFrom, dateTo) {
    const token = await getAccessToken();

    const response = await fetch(
        "https://services.sentinel-hub.com/catalog/v1/search",
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "collections": ["sentinel-2-l1c"],
                "datetime": `${dateFrom}/${dateTo}`,
                "intersects": intersectsGeometry,
                "limit": 1
            })
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error(`Eroare catalog: ${response.status}`, errText);
        throw new Error(`Eroare catalog Sentinel Hub. Status: ${response.status}`);
    }

    const result = await response.json();
    return result.features;
}