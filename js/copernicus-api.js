const CLIENT_ID = "e4214c35-0039-4bbb-a0c3-1a63329accd1";
const CLIENT_SECRET = "AkvWMNBMjOUTiuHli4UevHuVRm92AGSi";

let accessToken = null;

async function getAccessToken() {
    if (accessToken) {
        return accessToken;
    }

    const body = `grant_type=client_credentials&client_id=${encodeURIComponent(CLIENT_ID)}&client_secret=${encodeURIComponent(CLIENT_SECRET)}`;

    const response = await fetch(
        "https://services.sentinel-hub.com/auth/realms/main/protocol/openid-connect/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error("Eroare la token:", errText);
        throw new Error("Nu s-a putut obține token-ul.");
    }

    const data = await response.json();
    accessToken = data.access_token;
    return accessToken;
}

// Evalscript pentru banda B02 (albastru), cu gain pentru afisare vizuala (normalizare/corectie)
const EVALSCRIPT_B02 = `
//VERSION=3
function setup() {
  return {
    input: ["B02"],
    output: { bands: 1, sampleType: "AUTO" } // AUTO scaleaza automat [0,1] -> [0,255]
  };
}

function evaluatePixel(sample) {
  // gain = factor de amplificare pentru a face imaginea vizibila
  // (reflectanta bruta e foarte intunecata fara corectie)
  let gain = 3.5;
  let value = sample.B02 * gain;
  return [value];
}
`;

// Genereaza o imagine PNG reala (banda B02, normalizata) pentru un bbox dat
// bbox = [minLon, minLat, maxLon, maxLat] in EPSG:4326
async function fetchSentinelImage(bbox, dateFrom, dateTo, width = 512, height = 512) {
    const token = await getAccessToken();

    const requestBody = {
        input: {
            bounds: {
                bbox: bbox,
                properties: {
                    crs: "http://www.opengis.net/def/crs/EPSG/0/4326"
                }
            },
            data: [
                {
                    type: "sentinel-2-l1c",
                    dataFilter: {
                        timeRange: {
                            from: dateFrom,
                            to: dateTo
                        }
                    }
                }
            ]
        },
        output: {
            width: width,
            height: height,
            responses: [
                {
                    identifier: "default",
                    format: { type: "image/png" }
                }
            ]
        },
        evalscript: EVALSCRIPT_B02
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
        console.error(`Eroare Process API: ${response.status}`);
        console.error("Detalii:", errText);
        throw new Error(`Eroare la generarea imaginii Sentinel. Status: ${response.status}`);
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
}

async function searchSentinelProducts(intersectsGeometry) {
    const token = await getAccessToken();

    // IMPORTANT: calea corecta este /catalog/v1/search, NU /api/v1/catalog/search
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
                "datetime": "2024-06-01T00:00:00Z/2024-06-30T23:59:59Z",
                "intersects": intersectsGeometry,
                "limit": 1
            })
        }
    );

    if (!response.ok) {
        const errText = await response.text();
        console.error(`Serverul a raspuns cu statusul: ${response.status}`);
        console.error("Detalii eroare:", errText);
        throw new Error(`Eroare la interogarea Sentinel Hub. Status: ${response.status}`);
    }

    const result = await response.json();
    return result.features;
}