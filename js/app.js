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
            minZoom: 2,
        })
    });

    console.log("Harta și instrumentele de navigare au fost inițializate cu succes!");

    const wktFormat = new ol.format.WKT();
    const geojsonFormat = new ol.format.GeoJSON();

    const satelliteSource = new ol.source.Vector();
    const satelliteLayer = new ol.layer.Vector({
        source: satelliteSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: 'rgba(255, 255, 255, 0.8)', width: 1.5 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.05)' })
        })
    });
    map.addLayer(satelliteLayer);

    let sentinelImageLayer = new ol.layer.Image({ source: null });
    map.addLayer(sentinelImageLayer);

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

    const drawSource = new ol.source.Vector();
    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(255, 204, 51, 0.2)' }),
            stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2.5 })
        })
    });
    map.addLayer(drawLayer);

    
    let sentinelCanvas = null;     
    let sentinelBbox4326 = null;   
    let sentinelImgW = 0;
    let sentinelImgH = 0;
    let b02ChartInstance = null;

    const analyzeBtn = document.getElementById('btn-analyze-b02');
    const b02Panel = document.getElementById('b02-panel');
    const b02ChartContainer = document.getElementById('b02-chart-container');

   
    function storeSentinelImageInCanvas(imageUrl, bbox4326, width, height) {
        sentinelBbox4326 = bbox4326;
        sentinelImgW = width;
        sentinelImgH = height;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
            sentinelCanvas = document.createElement('canvas');
            sentinelCanvas.width = width;
            sentinelCanvas.height = height;
            const ctx = sentinelCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            analyzeBtn.disabled = false;
            console.log("Canvas B02 pregatit pentru analiza.");
        };
        img.src = imageUrl;
    }

    function analyzeB02() {
        if (!sentinelCanvas || !sentinelBbox4326) {
            alert("Nu există imagine satelitară. Apăsați mai întâi 'Caută Date'.");
            return;
        }

        const drawFeatures = drawSource.getFeatures();
        if (drawFeatures.length === 0) {
            alert("Desenați un poligon peste imaginea satelitară, apoi apăsați 'Analizează B02'.");
            return;
        }

        const polygon = drawFeatures[drawFeatures.length - 1];
        const geom = polygon.getGeometry();

        if (geom.getType() !== 'Polygon') {
            alert("Selectați un poligon (nu linie sau punct) pentru analiza B02.");
            return;
        }

        const geom4326 = geom.clone().transform(map.getView().getProjection(), 'EPSG:4326');
        const turfPoly = turf.feature({
            type: 'Polygon',
            coordinates: geom4326.getCoordinates()
        });

        const [minLon, minLat, maxLon, maxLat] = sentinelBbox4326;
        const ctx = sentinelCanvas.getContext('2d');

        const SAMPLES = 100;
        const polyExtent = geom4326.getExtent();
        const lonStep = (polyExtent[2] - polyExtent[0]) / SAMPLES;
        const latStep = (polyExtent[3] - polyExtent[1]) / SAMPLES;
        const pixelValues = [];

        for (let i = 0; i <= SAMPLES; i++) {
            for (let j = 0; j <= SAMPLES; j++) {
                const lon = polyExtent[0] + i * lonStep;
                const lat = polyExtent[1] + j * latStep;

                const pt = turf.point([lon, lat]);
                if (!turf.booleanPointInPolygon(pt, turfPoly)) continue;

                const cx = Math.floor((lon - minLon) / (maxLon - minLon) * sentinelImgW);
                const cy = Math.floor((maxLat - lat) / (maxLat - minLat) * sentinelImgH);

                if (cx < 0 || cy < 0 || cx >= sentinelImgW || cy >= sentinelImgH) continue;

                const pixel = ctx.getImageData(cx, cy, 1, 1).data;
                pixelValues.push(pixel[0]);
            }
        }

        if (pixelValues.length === 0) {
            alert("Poligonul desenat nu se suprapune cu imaginea satelitară. Asigurați-vă că desenați peste zona gri de pe hartă.");
            return;
        }

        const BINS = 16;
        const binSize = 256 / BINS;
        const counts = new Array(BINS).fill(0);
        pixelValues.forEach(v => {
            const bin = Math.min(Math.floor(v / binSize), BINS - 1);
            counts[bin]++;
        });

        const labels = counts.map((_, i) =>
            Math.round(i * binSize) + '–' + Math.round((i + 1) * binSize)
        );

    
        const mean = pixelValues.reduce((a, b) => a + b, 0) / pixelValues.length;
        const min = Math.min(...pixelValues);
        const max = Math.max(...pixelValues);
        const std = Math.sqrt(
            pixelValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pixelValues.length
        );

        renderHistogram(labels, counts, { mean, min, max, std, n: pixelValues.length });
    }

    function renderHistogram(labels, counts, stats) {
        b02Panel.classList.add('expanded');
        b02ChartContainer.classList.remove('hidden');

        if (b02ChartInstance) b02ChartInstance.destroy();

        const ctx = document.getElementById('b02-chart').getContext('2d');
        b02ChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Pixeli',
                    data: counts,
                    backgroundColor: 'rgba(99, 179, 237, 0.65)',
                    borderColor: 'rgba(99, 179, 237, 1)',
                    borderWidth: 1,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: 'Histogramă Banda B02',
                        color: '#e2e8f0',
                        font: { size: 11, weight: '600' }
                    }
                },
                scales: {
                    x: {
                        ticks: { color: '#718096', font: { size: 8 }, maxRotation: 45 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        ticks: { color: '#718096', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });

        document.getElementById('b02-stats').innerHTML = `
            <div class="b02-stat-card">
                <div class="b02-stat-label">Pixeli</div>
                <div class="b02-stat-value">${stats.n}</div>
            </div>
            <div class="b02-stat-card">
                <div class="b02-stat-label">Medie</div>
                <div class="b02-stat-value">${stats.mean.toFixed(1)}</div>
            </div>
            <div class="b02-stat-card">
                <div class="b02-stat-label">Min</div>
                <div class="b02-stat-value">${stats.min}</div>
            </div>
            <div class="b02-stat-card">
                <div class="b02-stat-label">Max</div>
                <div class="b02-stat-value">${stats.max}</div>
            </div>
            <div class="b02-stat-card">
                <div class="b02-stat-label">Std Dev</div>
                <div class="b02-stat-value">${stats.std.toFixed(1)}</div>
            </div>
            <div class="b02-stat-card">
                <div class="b02-stat-label">Interval</div>
                <div class="b02-stat-value">${stats.max - stats.min}</div>
            </div>
        `;
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeB02);
    }

   
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
                                console.error("Eroare WKT:", err);
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
                    map.getView().fit(uploadedExtent, { duration: 1200, padding: [50, 50, 50, 50] });
                } else {
                    alert("Nu s-au găsit geometrii valide.");
                }
            } catch (error) {
                alert("Fișierul selectat nu este un JSON valid.");
            }
        };
        reader.readAsText(file);
    });

  
    $('#search').on('input', function () {
        const query = $(this).val().trim();
        const resultsContainer = $('#search-results');

        if (query.length < 2) {
            resultsContainer.empty().hide();
            return;
        }

        const geonamesUsername = 'bambiiiiiiiiiiiiiiii';
        const geonamesUrl = `https://secure.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&maxRows=10&orderby=relevance&isNameRequired=true&username=${geonamesUsername}`;

        $.ajax({
            url: geonamesUrl,
            method: 'GET',
            dataType: 'json',
            success: function (data) {
                resultsContainer.empty();

                if (!data || !data.geonames || data.geonames.length === 0) {
                    resultsContainer.hide();
                    return;
                }

                resultsContainer.show();

                data.geonames.forEach(function (location) {
                    const regiune = location.adminName1 ? location.adminName1 + ', ' : '';
                    const item = $(`
                        <div class="search-result-item" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #333;">
                            <div class="search-result-name" style="font-weight: bold; color: #fff;">${location.name}</div>
                            <div class="search-result-country" style="font-size: 11px; color: #aaa;">${regiune}${location.countryName}</div>
                        </div>
                    `);

                    item.on('click', function () {
                        const lon = parseFloat(location.lng);
                        const lat = parseFloat(location.lat);

                        map.getView().animate({
                            center: ol.proj.fromLonLat([lon, lat]),
                            zoom: 11,
                            duration: 1200,
                            easing: ol.easing.easeOut
                        });

                        $('#search').val(`${location.name}, ${location.countryName}`);
                        resultsContainer.empty().hide();
                    });

                    resultsContainer.append(item);
                });
            },
            error: function () {
                console.error("Eroare la preluarea sugestiilor Geonames.");
            }
        });
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#search').length && !$(e.target).closest('#search-results').length) {
            $('#search-results').hide();
        }
    });

   
    let selectedFeaturesArray = [];
    const selectedStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({ color: '#ffffff', width: 3 }),
        fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.4)' })
    });

    map.on('click', function (e) {
        if (drawTypeSelect && drawTypeSelect.value !== 'None' && drawTypeSelect.value !== 'Navigare liberă') return;

        const clickedFeature = map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
            if (layer === intersectionLayer) return null;
            return feature;
        });

        if (!clickedFeature) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            return;
        }

        if (selectedFeaturesArray.includes(clickedFeature)) {
            clickedFeature.setStyle(null);
            selectedFeaturesArray = selectedFeaturesArray.filter(f => f !== clickedFeature);
            return;
        }

        if (selectedFeaturesArray.length === 2) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
        }

        selectedFeaturesArray.push(clickedFeature);
        clickedFeature.setStyle(selectedStyle);

        if (selectedFeaturesArray.length === 2) {
            try {
                let feat1 = geojsonFormat.writeFeatureObject(selectedFeaturesArray[0], {
                    featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326'
                });
                let feat2 = geojsonFormat.writeFeatureObject(selectedFeaturesArray[1], {
                    featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326'
                });

                feat1 = turf.buffer(feat1, 0, { units: 'kilometers' });
                feat2 = turf.buffer(feat2, 0, { units: 'kilometers' });

                const intersectie = turf.intersect(turf.featureCollection([feat1, feat2]));

                if (intersectie) {
                    const olIntersectie = geojsonFormat.readFeature(intersectie, {
                        dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection()
                    });
                    intersectionSource.addFeatures([olIntersectie]);
                } else {
                    alert("Poligoanele nu se intersectează.");
                }
            } catch (err) {
                console.error("Eroare la calcul intersecție Turf:", err);
            }
        }
    });

   
    let drawInteraction, snapInteraction;
    const drawTypeSelect = document.getElementById('draw-type');
    const clearDrawButton = document.getElementById('clear-draw');
    const exportGeojsonBtn = document.getElementById('btn-export-geojson');
    const fetchCopernicusBtn = document.getElementById('btn-fetch-copernicus');

    function addDrawInteraction() {
        if (!drawTypeSelect) return;
        let value = drawTypeSelect.value;
        if (value === 'Navigare liberă') value = 'None';

        if (value !== 'None') {
            drawInteraction = new ol.interaction.Draw({ source: drawSource, type: value });
            map.addInteraction(drawInteraction);
            snapInteraction = new ol.interaction.Snap({ source: drawSource });
            map.addInteraction(snapInteraction);
        }
    }

    if (drawTypeSelect) {
        drawTypeSelect.addEventListener('change', function () {
            if (drawInteraction) map.removeInteraction(drawInteraction);
            if (snapInteraction) map.removeInteraction(snapInteraction);
            addDrawInteraction();
        });
    }
    addDrawInteraction();

    function resetSentinelImageLayer() {
        map.removeLayer(sentinelImageLayer);
        sentinelImageLayer = new ol.layer.Image({ source: null });
        map.addLayer(sentinelImageLayer);
    }

    if (clearDrawButton) {
        clearDrawButton.addEventListener('click', function () {
            drawSource.clear();
            satelliteSource.clear();
            intersectionSource.clear();
            vectorSource.clear();
            selectedFeaturesArray = [];
            resetSentinelImageLayer();

            sentinelCanvas = null;
            sentinelBbox4326 = null;
            analyzeBtn.disabled = true;
            b02Panel.classList.remove('expanded');
            b02ChartContainer.classList.add('hidden');
            if (b02ChartInstance) { b02ChartInstance.destroy(); b02ChartInstance = null; }

            console.log("Toate straturile și geometriile au fost șterse.");
        });
    }

    if (exportGeojsonBtn) {
        exportGeojsonBtn.addEventListener('click', function () {
            const features = drawSource.getFeatures();
            if (features.length === 0) {
                alert("Nu există geometrii desenate pe hartă pentru export!");
                return;
            }
            const geojsonObj = geojsonFormat.writeFeaturesObject(features, {
                featureProjection: map.getView().getProjection(),
                dataProjection: 'EPSG:4326'
            });
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojsonObj));
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", dataStr);
            dlAnchor.setAttribute("download", "geometrii_exportate.geojson");
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
        });
    }


    if (fetchCopernicusBtn) {
        fetchCopernicusBtn.addEventListener('click', async function () {
            satelliteSource.clear();
            resetSentinelImageLayer();

            let targetGeoJSON = null;
            const features = drawSource.getFeatures();

            if (features.length > 0) {
                try {
                    const geom = features[0].getGeometry();
                    const geom4326 = geom.clone().transform(map.getView().getProjection(), 'EPSG:4326');

                    if (geom4326.getType() !== 'Polygon') {
                        const rawGeo = geojsonFormat.writeGeometryObject(geom4326);
                        if (rawGeo.type === 'Polygon') {
                            targetGeoJSON = rawGeo;
                        } else {
                            const extent = geom4326.getExtent();
                            targetGeoJSON = {
                                type: "Polygon",
                                coordinates: [[
                                    [extent[0], extent[1]], [extent[2], extent[1]],
                                    [extent[2], extent[3]], [extent[0], extent[3]],
                                    [extent[0], extent[1]]
                                ]]
                            };
                        }
                    } else {
                        targetGeoJSON = geojsonFormat.writeGeometryObject(geom4326);
                    }
                } catch (e) {
                    console.error("Eroare la conversia geometriei în EPSG:4326:", e);
                }
            }

            if (!targetGeoJSON) {
                const extent = map.getView().calculateExtent(map.getSize());
                const extent4326 = ol.proj.transformExtent(extent, map.getView().getProjection(), 'EPSG:4326');
                targetGeoJSON = {
                    type: "Polygon",
                    coordinates: [[
                        [extent4326[0], extent4326[1]], [extent4326[2], extent4326[1]],
                        [extent4326[2], extent4326[3]], [extent4326[0], extent4326[3]],
                        [extent4326[0], extent4326[1]]
                    ]]
                };
            }

            try {
                console.log("Se trimite la Sentinel Hub geometria curățată:", JSON.stringify(targetGeoJSON));

                const products = await searchSentinelProducts(targetGeoJSON);

                if (!products || products.length === 0) {
                    alert("Nu s-au găsit produse Sentinel 2 în această zonă.");
                    return;
                }

                products.forEach((product, index) => {
                    if (product.geometry) {
                        const olFeature = geojsonFormat.readFeature(product.geometry, {
                            dataProjection: 'EPSG:4326',
                            featureProjection: map.getView().getProjection()
                        });
                        olFeature.set('id', product.id || `SENTINEL_PROD_${index}`);
                        satelliteSource.addFeatures([olFeature]);
                    }
                });
                console.log(`Succes! S-au mapat ${products.length} poligoane de satelit.`);

                // Generam imaginea reala Sentinel-2 (banda B02) pentru primul produs
                const firstProduct = products[0];
                if (firstProduct && firstProduct.geometry) {
                    const geomFeature = geojsonFormat.readFeature(firstProduct.geometry, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:4326'
                    });
                    const bbox4326 = geomFeature.getGeometry().getExtent();

                    const dateFrom = "2024-06-01T00:00:00Z";
                    const dateTo = "2024-06-30T23:59:59Z";

                    const [minLon, minLat, maxLon, maxLat] = bbox4326;
                    const avgLat = (minLat + maxLat) / 2;
                    const metersPerDegLon = 111320 * Math.cos(avgLat * Math.PI / 180);
                    const metersPerDegLat = 110540;
                    const widthMeters = (maxLon - minLon) * metersPerDegLon;
                    const heightMeters = (maxLat - minLat) * metersPerDegLat;

                    const MAX_RES = 195;
                    const MAX_PX = 2000;
                    let imgWidth = Math.min(Math.max(Math.ceil(widthMeters / MAX_RES), 64), MAX_PX);
                    let imgHeight = Math.min(Math.max(Math.ceil(heightMeters / MAX_RES), 64), MAX_PX);

                    console.log(`Dimensiuni imagine: ${imgWidth}x${imgHeight} px`);

                    try {
                        console.log("Se genereaza imaginea Sentinel-2 (banda B02)...");
                        const imageUrl = await fetchSentinelImage(bbox4326, dateFrom, dateTo, imgWidth, imgHeight);

                        const imageExtent3857 = ol.proj.transformExtent(
                            bbox4326, 'EPSG:4326', map.getView().getProjection()
                        );

                        map.removeLayer(sentinelImageLayer);
                        sentinelImageLayer = new ol.layer.Image({
                            source: new ol.source.ImageStatic({
                                url: imageUrl,
                                imageExtent: imageExtent3857,
                                projection: map.getView().getProjection()
                            }),
                            opacity: 0.85
                        });
                        map.addLayer(sentinelImageLayer);

                        storeSentinelImageInCanvas(imageUrl, bbox4326, imgWidth, imgHeight);

                        console.log("Imagine Sentinel-2 afișată cu succes!");
                    } catch (imgErr) {
                        console.error("Eroare la generarea imaginii Sentinel:", imgErr);
                        alert("Nu s-a putut genera imaginea satelitară. Verifică consola pentru detalii.");
                    }
                }
            } catch (error) {
                console.error("Eroare Sentinel Hub:", error);
                alert("Serverul a respins cererea. Verifică consola pentru detalii.");
            }
        });
    }
};