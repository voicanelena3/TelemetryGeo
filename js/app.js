window.onload = function () {
    const mousePositionControl = new ol.control.MousePosition({
        coordinateFormat: ol.coordinate.createStringXY(4),
        projection: 'EPSG:4326',
        className: 'custom-mouse-position',
        target: document.getElementById('mouse-position'),
        undefinedHTML: '&nbsp;'
    });

    const map = new ol.Map({
        target: 'map',
        layers: [
            new ol.layer.Tile({
                source: new ol.source.OSM()
            })
        ],
        controls: ol.control.defaults.defaults().extend([
            new ol.control.FullScreen(),
            new ol.control.ScaleLine(),
            new ol.control.ZoomSlider(),
            mousePositionControl
        ]),
        view: new ol.View({
            center: ol.proj.fromLonLat([25.0, 46.0]),
            zoom: 6.5,
            minZoom: 3,
        })
    });

    console.log("Harta și instrumentele de navigare au fost inițializate cu succes!");

    const wktFormat = new ol.format.WKT();
    const geojsonFormat = new ol.format.GeoJSON();

    const satelliteSource = new ol.source.Vector();
    const satelliteLayer = new ol.layer.Vector({
        source: satelliteSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#ff5500', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 85, 0, 0.15)' })
        })
    });
    map.addLayer(satelliteLayer);

    const vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#3388ff', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(51, 136, 255, 0.2)' })
        })
    });
    map.addLayer(vectorLayer);

    const intersectionSource = new ol.source.Vector();
    const intersectionLayer = new ol.layer.Vector({
        source: intersectionSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#ff0000', width: 4 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.5)' })
        }),
        zIndex: 100
    });
    map.addLayer(intersectionLayer);

    let uploadedExtent = null;

    $('#json-file').on('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                const response = JSON.parse(event.target.result);
                vectorSource.clear();
                const manualFeaturesArray = [];

                if (response && response.data && response.data.length > 0) {
                    response.data.forEach(function (product) {
                        if (product.geometry) {
                            try {
                                const feature = wktFormat.readFeature(product.geometry, {
                                    dataProjection: 'EPSG:4326',
                                    featureProjection: map.getView().getProjection()
                                });
                                manualFeaturesArray.push(feature);
                            } catch (err) {
                                console.error("Eroare WKT fișier manual:", err);
                            }
                        }
                    });
                } else if (response.type === "FeatureCollection" || response.type === "Feature") {
                    const geojsonFeatures = geojsonFormat.readFeatures(response, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: map.getView().getProjection()
                    });
                    manualFeaturesArray.push(...geojsonFeatures);
                }

                if (manualFeaturesArray.length > 0) {
                    vectorSource.addFeatures(manualFeaturesArray);

                    uploadedExtent = vectorSource.getExtent();
                    map.getView().fit(uploadedExtent, {
                        duration: 1200,
                        padding: [50, 50, 50, 50]
                    });

                    const recenterBtn = document.getElementById('btn-recenter');
                    recenterBtn.disabled = false;
                    recenterBtn.title = 'Revenire la datele încărcate';

                    console.log(`Urcat manual cu succes: ${manualFeaturesArray.length} geometrii.`);
                } else {
                    alert("Nu s-au găsit geometrii valide în fișierul selectat.");
                }
            } catch (error) {
                alert("Fișierul selectat nu este un JSON valid.");
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('btn-recenter').addEventListener('click', function () {
        if (uploadedExtent) {
            map.getView().fit(uploadedExtent, {
                duration: 1200,
                padding: [50, 50, 50, 50],
                easing: ol.easing.easeOut
            });
        }
    });

    $('#search').on('keypress', function (e) {
        if (e.which !== 13) return;

        const raw = $(this).val().trim();
        const query = raw.includes(',') ? raw.split(',')[0].trim() : raw;
        if (!query) return;
        $(this).val(query);

        const geonamesUsername = 'bambiiiiiiiiiiiiiiii';
        const geonamesUrl = `https://secure.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&maxRows=10&orderby=relevance&isNameRequired=true&cities=cities1000&username=${geonamesUsername}`;

        const resultsContainer = $('#search-results');
        resultsContainer.hide();
        resultsContainer.empty();
        $(this).css('opacity', '0.5');

        $.ajax({
            url: geonamesUrl,
            method: 'GET',
            dataType: 'json',
            success: function (data) {
                if (!data || !data.geonames || data.geonames.length === 0) {
                    alert("Locația nu a fost găsită.");
                    return;
                }

                resultsContainer.show();

                data.geonames.forEach(function (location) {
                    const item = $(`
                        <div class="search-result-item">
                            <div class="search-result-name">${location.name}</div>
                            <div class="search-result-country">${location.adminName1 || ''}, ${location.countryName}</div>
                        </div>
                    `);

                    item.on('click', function () {
                        const lon = parseFloat(location.lng);
                        const lat = parseFloat(location.lat);

                        map.getView().animate({
                            center: ol.proj.fromLonLat([lon, lat]),
                            zoom: 12,
                            duration: 1500,
                            easing: ol.easing.easeOut
                        });

                        $('#search').val(`${location.name}, ${location.countryName}`);
                        resultsContainer.empty();
                        resultsContainer.hide();
                    });

                    resultsContainer.append(item);
                });
            },
            error: function () {
                alert("A apărut o eroare la căutarea locației.");
            },
            complete: function () {
                $('#search').css('opacity', '1');
            }
        });
    });

    $(document).on('click', function (e) {
        if (
            !$(e.target).closest('#search').length &&
            !$(e.target).closest('#search-results').length
        ) {
            $('#search-results').hide();
        }
    });

    let selectedFeaturesArray = [];

    const selectedStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
        fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.3)' })
    });

    function isIntersectable(feature) {
        return feature.getGeometry().getType() !== 'Point';
    }

    function featureToPolygonGeoJSON(feature) {
        const geomType = feature.getGeometry().getType();

        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            return geojsonFormat.writeFeatureObject(feature, {
                featureProjection: map.getView().getProjection(),
                dataProjection: 'EPSG:4326'
            });
        }

        const geom4326 = feature.getGeometry().clone().transform(
            map.getView().getProjection(),
            'EPSG:4326'
        );

        let ring;
        if (geomType === 'LineString') {
            ring = geom4326.getCoordinates();
        } else if (geomType === 'MultiPoint') {
            ring = geom4326.getCoordinates();
        } else {
            return null;
        }

        if (ring.length < 3) {
            return null;
        }

        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            ring = ring.concat([first]);
        }

        return turf.polygon([ring]);
    }

    function clearSelection() {
        selectedFeaturesArray.forEach(f => f.setStyle(null));
        selectedFeaturesArray = [];
        intersectionSource.clear();
        removeStatsPanel();
    }

    function removeStatsPanel() {
        const panel = document.getElementById('stats-panel');
        if (panel) panel.classList.add('hidden');
    }

    function updateAndShowStatsPanel(areaKm, percent1, percent2) {
        const panel = document.getElementById('stats-panel');
        if (!panel) return;

        document.getElementById('area-val').innerText = areaKm.toFixed(2);
        document.getElementById('percent1-val').innerText = percent1.toFixed(1) + '%';
        document.getElementById('percent2-val').innerText = percent2.toFixed(1) + '%';

        document.getElementById('progress1-bar').style.width = Math.min(percent1, 100) + '%';
        document.getElementById('progress2-bar').style.width = Math.min(percent2, 100) + '%';

        panel.classList.remove('hidden');
    }

    map.on('click', function (e) {
        if (drawTypeSelect.value !== 'None') return;

        const clickedFeature = map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
            if (layer === intersectionLayer) return null;
            return feature;
        });

        if (!clickedFeature) {
            clearSelection();
            return;
        }

        if (selectedFeaturesArray.includes(clickedFeature)) {
            clickedFeature.setStyle(null);
            selectedFeaturesArray = selectedFeaturesArray.filter(f => f !== clickedFeature);
            intersectionSource.clear();
            removeStatsPanel();
            return;
        }

        if (!isIntersectable(clickedFeature)) {
            alert("Un singur punct nu are o suprafață care poate fi intersectată. Desenează o linie cu cel puțin 3 puncte sau un poligon.");
            return;
        }

        if (selectedFeaturesArray.length === 2) {
            clearSelection();
        }

        selectedFeaturesArray.push(clickedFeature);
        clickedFeature.setStyle(selectedStyle);

        if (selectedFeaturesArray.length === 2) {
            const geojson1 = featureToPolygonGeoJSON(selectedFeaturesArray[0]);
            const geojson2 = featureToPolygonGeoJSON(selectedFeaturesArray[1]);

            if (!geojson1 || !geojson2) {
                alert("Geometria selectată are prea puține puncte pentru a forma o suprafață (minim 3 puncte distincte).");
                clearSelection();
                return;
            }

            try {
                const intersectedGeoJSON = turf.intersect(geojson1, geojson2);

                if (intersectedGeoJSON) {
                    const intersectionFeature = geojsonFormat.readFeature(intersectedGeoJSON, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: map.getView().getProjection()
                    });
                    intersectionSource.addFeatures([intersectionFeature]);

                    const areaInSquareMeters = turf.area(intersectedGeoJSON);
                    const areaInSquareKm = areaInSquareMeters / 1000000;
                    const areaPolygon1 = turf.area(geojson1);
                    const areaPolygon2 = turf.area(geojson2);
                    const overlapPercent1 = (areaInSquareMeters / areaPolygon1) * 100;
                    const overlapPercent2 = (areaInSquareMeters / areaPolygon2) * 100;

                    updateAndShowStatsPanel(areaInSquareKm, overlapPercent1, overlapPercent2);
                } else {
                    alert("Formele selectate nu se intersectează.");
                    clearSelection();
                }
            } catch (err) {
                console.error(err);
                alert("Eroare la calcularea matematică a intersecției.");
                clearSelection();
            }
        }
    });

    const drawSource = new ol.source.Vector();
    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(255, 204, 51, 0.3)' }),
            stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2.5 }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#ffcc33' }),
                stroke: new ol.style.Stroke({ color: '#1a1c1e', width: 1.5 })
            })
        })
    });
    map.addLayer(drawLayer);

    let drawInteraction;
    let snapInteraction;
    const drawTypeSelect = document.getElementById('draw-type');
    const clearDrawButton = document.getElementById('clear-draw');

    function addDrawInteraction() {
        const value = drawTypeSelect.value;
        if (value !== 'None') {
            drawInteraction = new ol.interaction.Draw({ source: drawSource, type: value });
            map.addInteraction(drawInteraction);

            snapInteraction = new ol.interaction.Snap({ source: drawSource, pixelTolerance: 15 });
            map.addInteraction(snapInteraction);

            document.getElementById('map').style.cursor = 'crosshair';
        } else {
            document.getElementById('map').style.cursor = 'default';
        }
    }

    drawTypeSelect.addEventListener('change', function () {
        if (drawInteraction) map.removeInteraction(drawInteraction);
        if (snapInteraction) map.removeInteraction(snapInteraction);
        addDrawInteraction();
    });

    clearDrawButton.addEventListener('click', function () {
        if (confirm("Ești sigur că vrei să ștergi desenele și rezultatele de pe hartă?")) {
            if (drawInteraction) drawInteraction.abortDrawing();
            drawSource.clear();
            satelliteSource.clear();
            clearSelection();
            console.log("Desenele, intersecțiile și datele Copernicus au fost șterse.");
        }
    });

    addDrawInteraction();

    document.getElementById("btn-export-geojson").addEventListener("click", function () {

        const features = drawSource.getFeatures();

        if (features.length === 0) {

            alert("Nu există geometrii desenate.");

            return;

        }

        const geojsonFormat = new ol.format.GeoJSON();

        const geojson = geojsonFormat.writeFeatures(features, {

            featureProjection: map.getView().getProjection(),

            dataProjection: 'EPSG:4326'

        });

        const blob = new Blob([geojson], {

            type: "application/json"

        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download = "geometrii.geojson";

        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);

        URL.revokeObjectURL(url);

    });

    document.getElementById('btn-fetch-copernicus').addEventListener('click', async function () {
        const button = $(this);
        const originalText = button.text();

        let zonaWKT = null;
        let userGeometry4326 = null;
        const features = drawSource.getFeatures();

        if (features.length > 0) {
            const geometry = features[0].getGeometry().clone();
            geometry.transform(map.getView().getProjection(), 'EPSG:4326');
            userGeometry4326 = geometry;

            const wktFormatInternal = new ol.format.WKT({
                dataProjection: 'EPSG:4326',
                featureProjection: 'EPSG:4326'
            });

            zonaWKT = wktFormatInternal.writeGeometry(geometry, { decimals: 4 });
        }

        if (!zonaWKT) {
            alert("Te rog să desenezi mai întâi un poligon pe hartă pentru a delimita zona de căutare!");
            return;
        }

        button.prop('disabled', true).text('Se încarcă...');
        satelliteSource.clear();

        const products = await fetchCopernicusProducts('SENTINEL-2', 15, zonaWKT);
        const copernicusFeatures = [];
        const wktReader = new ol.format.WKT();

        let userGeoJSON = geojsonFormat.writeGeometryObject(userGeometry4326);

        try {
            userGeoJSON = turf.buffer(userGeoJSON, 0, { units: 'kilometers' });
            if (userGeoJSON.type === 'Feature') userGeoJSON = userGeoJSON.geometry;
        } catch (bufferErr) {
            console.warn("Validarea buffer-ului a eșuat pentru poligonul utilizatorului:", bufferErr);
        }

        products.forEach(function (product) {
            let geometryWKT = product.Footprint || product["OData.CSC.Geometry"] || product.Geometry;

            if (geometryWKT) {
                try {
                    if (geometryWKT.includes(';')) geometryWKT = geometryWKT.split(';').pop();

                    const wktMatch = geometryWKT.match(/(POLYGON|MULTIPOLYGON)\s*\(.+\)/i);
                    if (wktMatch) geometryWKT = wktMatch[0];

                    geometryWKT = geometryWKT.replace(/[\r\n\t]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .replace(/\(\s+/g, '(')
                        .replace(/\s+\)/g, ')')
                        .trim();

                    const sceneFeatureInternal = wktReader.readFeature(geometryWKT);
                    if (sceneFeatureInternal) {
                        let sceneGeoJSON = geojsonFormat.writeGeometryObject(sceneFeatureInternal.getGeometry());

                        try {
                            sceneGeoJSON = turf.buffer(sceneGeoJSON, 0, { units: 'kilometers' });
                            if (sceneGeoJSON.type === 'Feature') sceneGeoJSON = sceneGeoJSON.geometry;
                        } catch (sceneBufErr) { }

                        const intersectedGeoJSON = turf.intersect(userGeoJSON, sceneGeoJSON);

                        if (intersectedGeoJSON) {
                            const clippedFeature = geojsonFormat.readFeature(intersectedGeoJSON, {
                                dataProjection: 'EPSG:4326',
                                featureProjection: map.getView().getProjection()
                            });
                            clippedFeature.setProperties({ name: product.Name, id: product.Id });
                            copernicusFeatures.push(clippedFeature);
                        }
                    }
                } catch (err) {
                    console.error("Eroare parser WKT sau intersecție pentru produsul:", product.Name, err);
                }
            }
        });

        if (copernicusFeatures.length > 0) {
            satelliteSource.addFeatures(copernicusFeatures);
            map.getView().fit(satelliteSource.getExtent(), {
                duration: 1200,
                padding: [50, 50, 50, 50]
            });
            console.log(`S-au randat cu succes ${copernicusFeatures.length} fragmente decupate.`);
        } else {
            alert("Nu s-au găsit produse Copernicus care să se suprapună valid cu zona selectată.");
        }

        button.prop('disabled', false).text(originalText);
    });
};