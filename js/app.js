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

    function cloudCoverColor(percent, alpha) {
        let r, g, b;
        if (percent <= 25) {
            const t = percent / 25;
            r = Math.round(34 + t * (255 - 34));
            g = Math.round(197 - t * 47);
            b = Math.round(94 - t * 94);
        } else if (percent <= 60) {
            const t = (percent - 25) / 35;
            r = 255;
            g = Math.round(150 - t * 130);
            b = 0;
        } else {
            const t = (percent - 60) / 40;
            r = 255;
            g = Math.round(20 - t * 20);
            b = 0;
        }
        return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
    }

    function cloudCoverLabel(percent) {
        if (percent <= 10) return '\u2600\ufe0f Cer aproape senin';
        if (percent <= 25) return '\ud83c\udf24\ufe0f Par\u021bial \u00eennorat';
        if (percent <= 50) return '\u26c5 Moderat \u00eennorat';
        if (percent <= 75) return '\ud83c\udf25\ufe0f Predominant \u00eennorat';
        return '\u2601\ufe0f \u00cennorare ridicat\u0103';
    }

    function satelliteStyleFn(feature) {
        const cc = feature.get('eo:cloud_cover') ?? feature.get('cloudCover') ?? null;
        const percent = cc !== null ? parseFloat(cc) : 50;
        return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: cloudCoverColor(percent, 0.9), width: 2 }),
            fill: new ol.style.Fill({ color: cloudCoverColor(percent, 0.12) })
        });
    }

    const satelliteSource = new ol.source.Vector();
    const satelliteLayer = new ol.layer.Vector({
        source: satelliteSource,
        style: satelliteStyleFn
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
            stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2.5 }),
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: '#ffcc33' }),
                stroke: new ol.style.Stroke({ color: '#7c4a03', width: 1.5 })
            })
        })
    });
    map.addLayer(drawLayer);

    const searchMarkerSource = new ol.source.Vector();
    const searchMarkerLayer = new ol.layer.Vector({
        source: searchMarkerSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 8,
                fill: new ol.style.Fill({ color: '#ff3b3b' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            })
        }),
        zIndex: 200
    });
    map.addLayer(searchMarkerLayer);

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
            alert("Poligonul desenat nu se suprapune cu imaginea satelitară.");
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

        document.getElementById('b02-stat-pixeli').textContent = stats.n;
        document.getElementById('b02-stat-medie').textContent = stats.mean.toFixed(1);
        document.getElementById('b02-stat-min').textContent = stats.min;
        document.getElementById('b02-stat-max').textContent = stats.max;
        document.getElementById('b02-stat-std').textContent = stats.std.toFixed(1);
        document.getElementById('b02-stat-interval').textContent = (stats.max - stats.min);
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeB02);
    }

    const cloudPanel = document.getElementById('cloud-panel');

    document.getElementById('cloud-panel-close').addEventListener('click', function () {
        cloudPanel.style.display = 'none';
    });

    function showCloudPanel(feature) {
        const cc = feature.get('eo:cloud_cover') ?? feature.get('cloudCover') ?? null;
        const datetime = feature.get('datetime') ?? feature.get('acquisitionDate') ?? null;
        const id = feature.get('id') ?? '—';

        const percent = cc !== null ? parseFloat(cc) : null;

        const cpId = id.length > 32 ? id.substring(0, 32) + '…' : id;
        document.getElementById('cp-id').textContent = cpId;

        if (datetime) {
            const d = new Date(datetime);
            document.getElementById('cp-date').textContent = isNaN(d)
                ? datetime
                : d.toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            document.getElementById('cp-date').textContent = '—';
        }

        if (percent !== null) {
            document.getElementById('cp-cc').textContent = percent.toFixed(1) + '%';
            document.getElementById('cp-label').textContent = cloudCoverLabel(percent);
            const bar = document.getElementById('cp-bar');
            bar.style.width = Math.min(percent, 100) + '%';
            bar.style.background = 'linear-gradient(90deg,' + cloudCoverColor(0, 0.9) + ',' + cloudCoverColor(percent, 0.9) + ')';
        } else {
            document.getElementById('cp-cc').textContent = 'Nedisponibil';
            document.getElementById('cp-label').textContent = 'Date cloud cover absente din metadata produsului';
            document.getElementById('cp-bar').style.width = '0%';
        }

        cloudPanel.style.display = 'block';
    }

    const tooltip = document.getElementById('map-tooltip');

    map.on('pointermove', function (e) {
        const feature = map.forEachFeatureAtPixel(e.pixel, function (f, layer) {
            if (layer === satelliteLayer) return f;
            return null;
        });

        if (feature) {
            const cc = feature.get('eo:cloud_cover') ?? feature.get('cloudCover') ?? null;
            const datetime = feature.get('datetime') ?? feature.get('acquisitionDate') ?? null;
            const dateStr = datetime ? new Date(datetime).toLocaleDateString('ro-RO') : 'Dată necunoscută';
            const ccStr = cc !== null ? parseFloat(cc).toFixed(1) + '% acoperire nori' : 'Cloud cover nedisponibil';

            document.getElementById('tooltip-date').textContent = dateStr;
            document.getElementById('tooltip-cc').textContent   = ccStr;
            tooltip.style.display = 'block';
            tooltip.style.left = (e.originalEvent.pageX + 14) + 'px';
            tooltip.style.top = (e.originalEvent.pageY - 10) + 'px';
            map.getTargetElement().style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            if (!drawTypeSelect || drawTypeSelect.value === 'None' || drawTypeSelect.value === 'Navigare liberă') {
                map.getTargetElement().style.cursor = '';
            }
        }
    });

    let uploadedExtent = null;
    let dataExtent = null;
    const btnRecenter = document.getElementById('btn-recenter');

    function setDataExtent(extent) {
        if (!extent || extent.some(v => !isFinite(v))) return;
        dataExtent = extent;
        if (btnRecenter) btnRecenter.disabled = false;
    }

    if (btnRecenter) {
        btnRecenter.addEventListener('click', function () {
            if (!dataExtent) return;
            map.getView().fit(dataExtent, { duration: 1000, padding: [50, 50, 50, 50], maxZoom: 16 });
        });
    }

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
                    setDataExtent(uploadedExtent);
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

    const clearSearchBtn = document.getElementById('clear-search');

    function updateClearSearchVisibility() {
        if (!clearSearchBtn) return;
        const hasText = $('#search').val().trim().length > 0;
        clearSearchBtn.style.display = hasText ? 'flex' : 'none';
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function () {
            $('#search').val('').trigger('focus');
            $('#search-results').empty().hide();
            searchMarkerSource.clear();
            if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
            if (currentSearchXhr) { currentSearchXhr.abort(); currentSearchXhr = null; }
            updateClearSearchVisibility();
        });
    }

    let searchDebounceTimer = null;
    let currentSearchXhr = null;
    let searchRequestSeq = 0;

    $('#search').on('input', function () {
        const query = $(this).val().trim();
        const resultsContainer = $('#search-results');

        updateClearSearchVisibility();

        if (searchDebounceTimer) {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = null;
        }

        if (query.length < 2) {
            resultsContainer.empty().hide();
            if (currentSearchXhr) {
                currentSearchXhr.abort();
                currentSearchXhr = null;
            }
            return;
        }

        searchDebounceTimer = setTimeout(function () {
            const requestId = ++searchRequestSeq;

            if (currentSearchXhr) {
                currentSearchXhr.abort();
            }

            const geonamesUsername = 'bambiiiiiiiiiiiiiiii';
            const geonamesUrl = 'https://secure.geonames.org/searchJSON?name_startsWith=' + encodeURIComponent(query) + '&maxRows=10&orderby=relevance&isNameRequired=true&username=' + geonamesUsername;

            currentSearchXhr = $.ajax({
                url: geonamesUrl,
                method: 'GET',
                dataType: 'json',
                success: function (data) {
                    if (requestId !== searchRequestSeq) return;
                    if ($('#search').val().trim() !== query) return;

                    resultsContainer.empty();

                    if (!data || !data.geonames || data.geonames.length === 0) {
                        resultsContainer.hide();
                        return;
                    }

                    resultsContainer.show();

                    data.geonames.forEach(function (location) {
                        const regiune = location.adminName1 ? location.adminName1 + ', ' : '';
                        const item = $('<div class="search-result-item" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #333;">' +
                            '<div class="search-result-name" style="font-weight:bold;color:#fff;">' + location.name + '</div>' +
                            '<div class="search-result-country" style="font-size:11px;color:#aaa;">' + regiune + location.countryName + '</div>' +
                            '</div>');

                        item.on('click', function () {
                            const lon = parseFloat(location.lng);
                            const lat = parseFloat(location.lat);
                            const coord = ol.proj.fromLonLat([lon, lat]);

                            map.getView().animate({
                                center: coord,
                                zoom: 11,
                                duration: 1200,
                                easing: ol.easing.easeOut
                            });

                            searchMarkerSource.clear();
                            searchMarkerSource.addFeature(new ol.Feature({
                                geometry: new ol.geom.Point(coord)
                            }));

                            $('#search').val(location.name + ', ' + location.countryName);
                            resultsContainer.empty().hide();
                            updateClearSearchVisibility();
                        });

                        resultsContainer.append(item);
                    });
                },
                error: function (jqXHR) {
                    if (jqXHR.statusText === 'abort') return;
                    console.error("Eroare la preluarea sugestiilor Geonames.");
                }
            });
        }, 300);
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

    const statsPanel = document.getElementById('stats-panel');
    const areaValEl = document.getElementById('area-val');
    const percent1ValEl = document.getElementById('percent1-val');
    const percent2ValEl = document.getElementById('percent2-val');
    const progress1BarEl = document.getElementById('progress1-bar');
    const progress2BarEl = document.getElementById('progress2-bar');

    function bboxDiagonalKm(geojsonFeature) {
        const bbox = turf.bbox(geojsonFeature);
        return turf.distance(
            turf.point([bbox[0], bbox[1]]),
            turf.point([bbox[2], bbox[3]]),
            { units: 'kilometers' }
        );
    }

    function lineToPolygon(geojsonFeature) {
        const coords = geojsonFeature.geometry.coordinates;
        if (!coords || coords.length < 3) return null;

        const first = coords[0];
        const last = coords[coords.length - 1];
        const ring = coords.slice();
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

        try {
            const poly = turf.polygon([ring]);
            const area = turf.area(poly);
            if (!area || area <= 0) return null;
            return turf.buffer(poly, 0, { units: 'kilometers' });
        } catch (e) {
            return null;
        }
    }

    function toIntersectablePolygon(geojsonFeature, otherFeature) {
        const geomType = geojsonFeature.geometry.type;
        if (geomType === 'Polygon' || geomType === 'MultiPolygon') {
            return turf.buffer(geojsonFeature, 0, { units: 'kilometers' });
        }

        if (geomType === 'LineString') {
            const asPolygon = lineToPolygon(geojsonFeature);
            if (asPolygon) return asPolygon;
        }

        const refDiag = Math.max(
            bboxDiagonalKm(geojsonFeature),
            otherFeature ? bboxDiagonalKm(otherFeature) : 0,
            0.1
        );
        const bufferKm = Math.max(refDiag * 0.02, 0.05);
        return turf.buffer(geojsonFeature, bufferKm, { units: 'kilometers' });
    }

    map.on('click', function (e) {
        if (drawTypeSelect && drawTypeSelect.value !== 'None' && drawTypeSelect.value !== 'Navigare liberă') return;

        const sentinelFeature = map.forEachFeatureAtPixel(e.pixel, function (f, layer) {
            if (layer === satelliteLayer) return f;
            return null;
        });
        if (sentinelFeature) {
            showCloudPanel(sentinelFeature);
            return;
        }

        const clickedFeature = map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
            if (layer === intersectionLayer) return null;
            if (layer === satelliteLayer) return null;
            return feature;
        });

        if (!clickedFeature) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            if (statsPanel) statsPanel.classList.add('hidden');
            return;
        }

        if (selectedFeaturesArray.includes(clickedFeature)) {
            clickedFeature.setStyle(null);
            selectedFeaturesArray = selectedFeaturesArray.filter(f => f !== clickedFeature);
            intersectionSource.clear();
            if (statsPanel) statsPanel.classList.add('hidden');
            return;
        }

        if (selectedFeaturesArray.length === 2) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            if (statsPanel) statsPanel.classList.add('hidden');
        }

        selectedFeaturesArray.push(clickedFeature);
        clickedFeature.setStyle(selectedStyle);

        if (selectedFeaturesArray.length === 2) {
            try {
                const feat1Raw = geojsonFormat.writeFeatureObject(selectedFeaturesArray[0], {
                    featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326'
                });
                const feat2Raw = geojsonFormat.writeFeatureObject(selectedFeaturesArray[1], {
                    featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326'
                });

                const feat1 = toIntersectablePolygon(feat1Raw, feat2Raw);
                const feat2 = toIntersectablePolygon(feat2Raw, feat1Raw);

                const intersectie = turf.intersect(turf.featureCollection([feat1, feat2]));

                if (intersectie) {
                    const olIntersectie = geojsonFormat.readFeature(intersectie, {
                        dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection()
                    });
                    intersectionSource.addFeatures([olIntersectie]);

                    const areaM2 = turf.area(intersectie);
                    const areaKm2 = areaM2 / 1e6;
                    const area1Km2 = turf.area(feat1) / 1e6;
                    const area2Km2 = turf.area(feat2) / 1e6;
                    const percent1 = area1Km2 > 0 ? Math.min((areaKm2 / area1Km2) * 100, 100) : 0;
                    const percent2 = area2Km2 > 0 ? Math.min((areaKm2 / area2Km2) * 100, 100) : 0;

                    if (areaValEl) areaValEl.textContent = areaKm2.toFixed(2);
                    if (percent1ValEl) percent1ValEl.textContent = percent1.toFixed(1) + '%';
                    if (percent2ValEl) percent2ValEl.textContent = percent2.toFixed(1) + '%';
                    if (progress1BarEl) progress1BarEl.style.width = percent1 + '%';
                    if (progress2BarEl) progress2BarEl.style.width = percent2 + '%';
                    if (statsPanel) statsPanel.classList.remove('hidden');
                } else {
                    if (statsPanel) statsPanel.classList.add('hidden');
                    alert("Geometriile nu se intersectează.");
                }
            } catch (err) {
                console.error("Eroare la calcul intersecție Turf:", err);
                if (statsPanel) statsPanel.classList.add('hidden');
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

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.keyCode !== 27) return;

        if (drawInteraction) {
            drawInteraction.abortDrawing();
        }

        if (drawTypeSelect && drawTypeSelect.value !== 'None') {
            drawTypeSelect.value = 'None';
            drawTypeSelect.dispatchEvent(new Event('change'));
        }
    });

    function resetSentinelImageLayer() {
        map.removeLayer(sentinelImageLayer);
        sentinelImageLayer = new ol.layer.Image({ source: null });
        map.addLayer(sentinelImageLayer);
    }

    if (clearDrawButton) {
        clearDrawButton.addEventListener('click', function () {
            drawSource.clear();
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            if (statsPanel) statsPanel.classList.add('hidden');

            sentinelCanvas = null;
            sentinelBbox4326 = null;
            if (analyzeBtn) analyzeBtn.disabled = true;
            if (b02Panel) b02Panel.classList.remove('expanded');
            if (b02ChartContainer) b02ChartContainer.classList.add('hidden');
            if (b02ChartInstance) { b02ChartInstance.destroy(); b02ChartInstance = null; }

            console.log("Geometriile desenate și intersecția au fost șterse.");
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
            cloudPanel.style.display = 'none';

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
                console.log("Se trimite la Sentinel Hub geometria:", JSON.stringify(targetGeoJSON));

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
                        olFeature.set('id', product.id || ('SENTINEL_PROD_' + index));
                        if (product.properties) {
                            Object.keys(product.properties).forEach(function(key) {
                                olFeature.set(key, product.properties[key]);
                            });
                        }
                        satelliteSource.addFeatures([olFeature]);
                    }
                });

                console.log("S-au mapat " + products.length + " poligoane de satelit.");
                setDataExtent(satelliteSource.getExtent());

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

                    try {
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

                        setDataExtent(imageExtent3857);
                        storeSentinelImageInCanvas(imageUrl, bbox4326, imgWidth, imgHeight);
                        console.log("Imagine Sentinel-2 afișată cu succes!");
                    } catch (imgErr) {
                        console.error("Eroare la generarea imaginii Sentinel:", imgErr);
                        alert("Nu s-a putut genera imaginea satelitară.");
                    }
                }
            } catch (error) {
                console.error("Eroare Sentinel Hub:", error);
                alert("Serverul a respins cererea. Verifică consola pentru detalii.");
            }
        });
    }
};