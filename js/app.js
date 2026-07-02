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
        layers: [ new ol.layer.Tile({ source: new ol.source.OSM() }) ],
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

    // =====================================================================
    // FUNCTII UTILITARE PENTRU CLOUD COVER
    // =====================================================================

    function cloudCoverColor(percent, alpha) {
        let r, g, b;
        if (percent <= 25) {
            const t = percent / 25;
            r = Math.round(34 + t * (255 - 34));
            g = Math.round(197 - t * 47);
            b = Math.round(94 - t * 94);
        } else if (percent <= 60) {
            const t = (percent - 25) / 35;
            r = 255; g = Math.round(150 - t * 130); b = 0;
        } else {
            const t = (percent - 60) / 40;
            r = 255; g = Math.round(20 - t * 20); b = 0;
        }
        return `rgba(${r},${g},${b},${alpha})`;
    }

    function cloudCoverLabel(percent) {
        if (percent <= 10) return '☀️ Cer aproape senin';
        if (percent <= 25) return '🌤️ Parțial înnorat';
        if (percent <= 50) return '⛅ Moderat înnorat';
        if (percent <= 75) return '🌥️ Predominant înnorat';
        return '☁️ Înnorare ridicată';
    }

    // =====================================================================
    // LAYERE
    // =====================================================================

    function satelliteStyleFn(feature) {
        const cc = feature.get('eo:cloud_cover') ?? feature.get('cloudCover') ?? null;
        const percent = cc !== null ? parseFloat(cc) : 50;
        return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: cloudCoverColor(percent, 0.9), width: 2 }),
            fill: new ol.style.Fill({ color: cloudCoverColor(percent, 0.12) })
        });
    }

    const satelliteSource = new ol.source.Vector();
    const satelliteLayer = new ol.layer.Vector({ source: satelliteSource, style: satelliteStyleFn });
    map.addLayer(satelliteLayer);

    let sentinelImageLayer = new ol.layer.Image({ source: null, zIndex: 5 });
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

    // Stilul de baza pentru desenare (inainte de imagine)
    const drawStyleNormal = new ol.style.Style({
        fill: new ol.style.Fill({ color: 'rgba(0, 255, 200, 0.15)' }),
        stroke: new ol.style.Stroke({ color: '#00ffc8', width: 2.5 }),
        image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({ color: '#00ffc8' }),
            stroke: new ol.style.Stroke({ color: '#005a47', width: 1.5 })
        })
    });

    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: function(feature) {
            // Dupa ce imaginea e incarcata, poligonul de analiza devine mai vizibil
            if (sentinelBbox4326 && feature.getGeometry && feature.getGeometry().getType() === 'Polygon') {
                return [
                    new ol.style.Style({
                        fill: new ol.style.Fill({ color: 'rgba(0, 255, 200, 0.2)' }),
                        stroke: new ol.style.Stroke({ color: '#ffffff', width: 3.5 })
                    }),
                    new ol.style.Style({
                        fill: new ol.style.Fill({ color: 'rgba(0, 255, 200, 0.2)' }),
                        stroke: new ol.style.Stroke({ color: '#00ffc8', width: 2, lineDash: [10, 5] })
                    })
                ];
            }
            return drawStyleNormal;
        },
        zIndex: 50
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

    // =====================================================================
    // VARIABILE GLOBALE ANALIZA SPECTRALA
    // =====================================================================

    let sentinelCanvas = null;      // canvas cu imaginea de analiza (B02 sau NDVI grayscale)
    let sentinelBbox4326 = null;
    let sentinelImgW = 0;
    let sentinelImgH = 0;
    let b02ChartInstance = null;
    let currentAnalysisMode = 'b02'; // modul curent de analiza

    const analyzeBtn = document.getElementById('btn-analyze-b02');
    const b02Panel = document.getElementById('b02-panel');
    const b02ChartContainer = document.getElementById('b02-chart-container');
    const vizModeSelect = document.getElementById('viz-mode');

    // =====================================================================
    // STOCARE IMAGINE IN CANVAS PENTRU ANALIZA
    // =====================================================================

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
            // Rerandam draw layer ca sa aplice stilul activ pe poligoanele existente
            drawLayer.changed();
            console.log("Canvas analiza pregatit.");
        };
        img.src = imageUrl;
    }

    // =====================================================================
    // ANALIZA HISTOGRAMA - adapatata la modul curent
    // =====================================================================

    function analyzeSpectral() {
        if (!sentinelCanvas || !sentinelBbox4326) {
            alert("Nu există imagine satelitară. Apăsați mai întâi 'Caută Date'.");
            return;
        }

        const drawFeatures = drawSource.getFeatures();
        if (drawFeatures.length === 0) {
            alert("Desenați un poligon peste imaginea satelitară.");
            return;
        }

        const polygon = drawFeatures[drawFeatures.length - 1];
        const geom = polygon.getGeometry();

        if (geom.getType() !== 'Polygon') {
            alert("Selectați un poligon pentru analiză.");
            return;
        }

        const geom4326 = geom.clone().transform(map.getView().getProjection(), 'EPSG:4326');
        const turfPoly = turf.feature({ type: 'Polygon', coordinates: geom4326.getCoordinates() });

        const [minLon, minLat, maxLon, maxLat] = sentinelBbox4326;
        const ctx = sentinelCanvas.getContext('2d');

        const SAMPLES = 100;
        const polyExtent = geom4326.getExtent();
        const lonStep = (polyExtent[2] - polyExtent[0]) / SAMPLES;
        const latStep = (polyExtent[3] - polyExtent[1]) / SAMPLES;
        const rawValues = [];

        for (let i = 0; i <= SAMPLES; i++) {
            for (let j = 0; j <= SAMPLES; j++) {
                const lon = polyExtent[0] + i * lonStep;
                const lat = polyExtent[1] + j * latStep;

                if (!turf.booleanPointInPolygon(turf.point([lon, lat]), turfPoly)) continue;

                const cx = Math.floor((lon - minLon) / (maxLon - minLon) * sentinelImgW);
                const cy = Math.floor((maxLat - lat) / (maxLat - minLat) * sentinelImgH);

                if (cx < 0 || cy < 0 || cx >= sentinelImgW || cy >= sentinelImgH) continue;

                const pixel = ctx.getImageData(cx, cy, 1, 1).data;
                rawValues.push(pixel[0]); // canal R (grayscale pentru B02 si NDVI analysis)
            }
        }

        if (rawValues.length === 0) {
            alert("Poligonul nu se suprapune cu imaginea satelitară.");
            return;
        }

        const isNdvi = currentAnalysisMode === 'ndvi';

        if (isNdvi) {
            // Remapam valorile 0-255 -> NDVI -1 la +1
            const ndviValues = rawValues.map(v => ((v / 255) * 2) - 1);
            buildNdviHistogram(ndviValues);
        } else {
            // Histograma standard 0-255 pentru B02/TrueColor/FalseColor
            buildB02Histogram(rawValues);
        }
    }

    function buildB02Histogram(pixelValues) {
        const BINS = 16;
        const binSize = 256 / BINS;
        const counts = new Array(BINS).fill(0);
        pixelValues.forEach(v => {
            counts[Math.min(Math.floor(v / binSize), BINS - 1)]++;
        });
        const labels = counts.map((_, i) =>
            Math.round(i * binSize) + '–' + Math.round((i + 1) * binSize)
        );

        const mean = pixelValues.reduce((a, b) => a + b, 0) / pixelValues.length;
        const min = Math.min(...pixelValues);
        const max = Math.max(...pixelValues);
        const std = Math.sqrt(pixelValues.reduce((a, b) => a + (b - mean) ** 2, 0) / pixelValues.length);

        const modeLabels = { b02: 'B02', truecolor: 'True Color (B04)', falsecolor: 'False Color (B08)' };
        const bandLabel = modeLabels[currentAnalysisMode] || 'B02';

        renderHistogram(labels, counts, { mean, min, max, std, n: pixelValues.length },
            `Histogramă ${bandLabel}`, 'rgba(99, 179, 237, 0.65)', 'rgba(99, 179, 237, 1)',
            null, null
        );
    }

    function buildNdviHistogram(ndviValues) {
        // 10 bins intre -1 si +1
        const BINS = 10;
        const binSize = 2 / BINS; // fiecare bin = 0.2 unitati NDVI
        const counts = new Array(BINS).fill(0);
        ndviValues.forEach(v => {
            const bin = Math.min(Math.floor((v + 1) / binSize), BINS - 1);
            counts[bin]++;
        });
        const labels = counts.map((_, i) => {
            const lo = (-1 + i * binSize).toFixed(1);
            const hi = (-1 + (i + 1) * binSize).toFixed(1);
            return `${lo}→${hi}`;
        });

        const mean = ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length;
        const min = Math.min(...ndviValues);
        const max = Math.max(...ndviValues);
        const std = Math.sqrt(ndviValues.reduce((a, b) => a + (b - mean) ** 2, 0) / ndviValues.length);

        // Culori gradient verde pentru NDVI
        const bgColors = counts.map((_, i) => {
            const ndviMid = -1 + (i + 0.5) * binSize;
            if (ndviMid < -0.2) return 'rgba(50, 50, 180, 0.7)';    // apa - albastru
            if (ndviMid < 0)    return 'rgba(220, 50, 30, 0.7)';    // sol - rosu
            if (ndviMid < 0.2)  return 'rgba(240, 210, 30, 0.7)';   // slab - galben
            if (ndviMid < 0.4)  return 'rgba(100, 200, 60, 0.7)';   // moderat - verde
            return 'rgba(20, 130, 20, 0.7)';                         // dens - verde inchis
        });

        renderHistogram(labels, counts, { mean: mean.toFixed(3), min: min.toFixed(3), max: max.toFixed(3), std: std.toFixed(3), n: ndviValues.length },
            'Histogramă NDVI', bgColors, bgColors.map(c => c.replace('0.7', '1')),
            'NDVI', 'Frecvență pixeli'
        );
    }

    function renderHistogram(labels, counts, stats, title, bgColor, borderColor, xLabel, yLabel) {
        b02Panel.classList.add('expanded');
        b02ChartContainer.classList.remove('hidden');
        const hint = document.getElementById('analyze-hint');
        if (hint) hint.style.display = 'none';

        if (b02ChartInstance) b02ChartInstance.destroy();

        const ctx = document.getElementById('b02-chart').getContext('2d');
        b02ChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Pixeli',
                    data: counts,
                    backgroundColor: bgColor,
                    borderColor: borderColor,
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
                        text: title,
                        color: '#e2e8f0',
                        font: { size: 11, weight: '600' }
                    }
                },
                scales: {
                    x: {
                        title: xLabel ? { display: true, text: xLabel, color: '#718096', font: { size: 9 } } : { display: false },
                        ticks: { color: '#718096', font: { size: 8 }, maxRotation: 45 },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        title: yLabel ? { display: true, text: yLabel, color: '#718096', font: { size: 9 } } : { display: false },
                        ticks: { color: '#718096', font: { size: 9 } },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                }
            }
        });

        document.getElementById('b02-stat-pixeli').textContent = stats.n;
        document.getElementById('b02-stat-medie').textContent = typeof stats.mean === 'number' ? stats.mean.toFixed(1) : stats.mean;
        document.getElementById('b02-stat-min').textContent = stats.min;
        document.getElementById('b02-stat-max').textContent = stats.max;
        document.getElementById('b02-stat-std').textContent = typeof stats.std === 'number' ? stats.std.toFixed(1) : stats.std;
        document.getElementById('b02-stat-interval').textContent = typeof stats.min === 'number'
            ? (stats.max - stats.min)
            : (parseFloat(stats.max) - parseFloat(stats.min)).toFixed(3);
    }

    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', analyzeSpectral);
    }

    // =====================================================================
    // CLOUD PANEL
    // =====================================================================

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
        document.getElementById('cp-date').textContent = datetime
            ? (isNaN(new Date(datetime)) ? datetime : new Date(datetime).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' }))
            : '—';

        if (percent !== null) {
            document.getElementById('cp-cc').textContent = percent.toFixed(1) + '%';
            document.getElementById('cp-label').textContent = cloudCoverLabel(percent);
            const bar = document.getElementById('cp-bar');
            bar.style.width = Math.min(percent, 100) + '%';
            bar.style.background = `linear-gradient(90deg,${cloudCoverColor(0, 0.9)},${cloudCoverColor(percent, 0.9)})`;
        } else {
            document.getElementById('cp-cc').textContent = 'Nedisponibil';
            document.getElementById('cp-label').textContent = 'Date cloud cover absente';
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
            document.getElementById('tooltip-cc').textContent = ccStr;
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

    // =====================================================================
    // UPLOAD JSON
    // =====================================================================

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
                const arr = [];

                if (response && response.data && response.data.length > 0) {
                    response.data.forEach(function (product) {
                        if (product.geometry) {
                            try {
                                arr.push(wktFormat.readFeature(product.geometry, {
                                    dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection()
                                }));
                            } catch (err) { console.error("Eroare WKT:", err); }
                        }
                    });
                } else if (response.type === "FeatureCollection" || response.type === "Feature") {
                    arr.push(...geojsonFormat.readFeatures(response, {
                        dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection()
                    }));
                }

                if (arr.length > 0) {
                    vectorSource.addFeatures(arr);
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

    // =====================================================================
    // CAUTARE GEONAMES
    // =====================================================================

    const clearSearchBtn = document.getElementById('clear-search');
    let searchDebounceTimer = null;
    let currentSearchXhr = null;
    let searchRequestSeq = 0;

    function updateClearSearchVisibility() {
        if (!clearSearchBtn) return;
        clearSearchBtn.style.display = $('#search').val().trim().length > 0 ? 'flex' : 'none';
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

    $('#search').on('input', function () {
        const query = $(this).val().trim();
        const resultsContainer = $('#search-results');
        updateClearSearchVisibility();
        if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
        if (query.length < 2) { resultsContainer.empty().hide(); if (currentSearchXhr) { currentSearchXhr.abort(); currentSearchXhr = null; } return; }

        searchDebounceTimer = setTimeout(function () {
            const requestId = ++searchRequestSeq;
            if (currentSearchXhr) currentSearchXhr.abort();

            currentSearchXhr = $.ajax({
                url: `https://secure.geonames.org/searchJSON?name_startsWith=${encodeURIComponent(query)}&maxRows=10&orderby=relevance&isNameRequired=true&username=bambiiiiiiiiiiiiiiii`,
                method: 'GET', dataType: 'json',
                success: function (data) {
                    if (requestId !== searchRequestSeq) return;
                    if ($('#search').val().trim() !== query) return;
                    resultsContainer.empty();
                    if (!data || !data.geonames || data.geonames.length === 0) { resultsContainer.hide(); return; }
                    resultsContainer.show();
                    data.geonames.forEach(function (location) {
                        const regiune = location.adminName1 ? location.adminName1 + ', ' : '';
                        const item = $(`<div class="search-result-item" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #333;">
                            <div class="search-result-name" style="font-weight:bold;color:#fff;">${location.name}</div>
                            <div class="search-result-country" style="font-size:11px;color:#aaa;">${regiune}${location.countryName}</div>
                        </div>`);
                        item.on('click', function () {
                            const lon = parseFloat(location.lng);
                            const lat = parseFloat(location.lat);
                            const coord = ol.proj.fromLonLat([lon, lat]);
                            map.getView().animate({ center: coord, zoom: 11, duration: 1200, easing: ol.easing.easeOut });
                            searchMarkerSource.clear();
                            searchMarkerSource.addFeature(new ol.Feature({ geometry: new ol.geom.Point(coord) }));
                            $('#search').val(`${location.name}, ${location.countryName}`);
                            resultsContainer.empty().hide();
                            updateClearSearchVisibility();
                        });
                        resultsContainer.append(item);
                    });
                },
                error: function (jqXHR) { if (jqXHR.statusText !== 'abort') console.error("Eroare Geonames."); }
            });
        }, 300);
    });

    $(document).on('click', function (e) {
        if (!$(e.target).closest('#search').length && !$(e.target).closest('#search-results').length) {
            $('#search-results').hide();
        }
    });

    // =====================================================================
    // SELECTIE FEATURI SI INTERSECTIE
    // =====================================================================

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

    function bboxDiagonalKm(f) {
        const bbox = turf.bbox(f);
        return turf.distance(turf.point([bbox[0], bbox[1]]), turf.point([bbox[2], bbox[3]]), { units: 'kilometers' });
    }

    function toIntersectablePolygon(f, other) {
        const t = f.geometry.type;
        if (t === 'Polygon' || t === 'MultiPolygon') return turf.buffer(f, 0, { units: 'kilometers' });
        if (t === 'LineString') {
            const coords = f.geometry.coordinates;
            if (coords.length >= 3) {
                const ring = coords.slice();
                const first = ring[0]; const last = ring[ring.length - 1];
                if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
                try {
                    const poly = turf.polygon([ring]);
                    if (turf.area(poly) > 0) return turf.buffer(poly, 0, { units: 'kilometers' });
                } catch (e) {}
            }
        }
        const refDiag = Math.max(bboxDiagonalKm(f), other ? bboxDiagonalKm(other) : 0, 0.1);
        return turf.buffer(f, Math.max(refDiag * 0.02, 0.05), { units: 'kilometers' });
    }

    map.on('click', function (e) {
        if (drawTypeSelect && drawTypeSelect.value !== 'None' && drawTypeSelect.value !== 'Navigare liberă') return;

        const sentinelFeature = map.forEachFeatureAtPixel(e.pixel, function (f, layer) {
            if (layer === satelliteLayer) return f;
            return null;
        });
        if (sentinelFeature) { showCloudPanel(sentinelFeature); return; }

        const clickedFeature = map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
            if (layer === intersectionLayer || layer === satelliteLayer) return null;
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
                const feat1Raw = geojsonFormat.writeFeatureObject(selectedFeaturesArray[0], { featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326' });
                const feat2Raw = geojsonFormat.writeFeatureObject(selectedFeaturesArray[1], { featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326' });
                const feat1 = toIntersectablePolygon(feat1Raw, feat2Raw);
                const feat2 = toIntersectablePolygon(feat2Raw, feat1Raw);
                const intersectie = turf.intersect(turf.featureCollection([feat1, feat2]));

                if (intersectie) {
                    intersectionSource.addFeatures([geojsonFormat.readFeature(intersectie, { dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection() })]);
                    const areaKm2 = turf.area(intersectie) / 1e6;
                    const area1Km2 = turf.area(feat1) / 1e6;
                    const area2Km2 = turf.area(feat2) / 1e6;
                    const p1 = area1Km2 > 0 ? Math.min((areaKm2 / area1Km2) * 100, 100) : 0;
                    const p2 = area2Km2 > 0 ? Math.min((areaKm2 / area2Km2) * 100, 100) : 0;

                    if (areaValEl) areaValEl.textContent = areaKm2.toFixed(2);
                    if (percent1ValEl) percent1ValEl.textContent = p1.toFixed(1) + '%';
                    if (percent2ValEl) percent2ValEl.textContent = p2.toFixed(1) + '%';
                    if (progress1BarEl) progress1BarEl.style.width = p1 + '%';
                    if (progress2BarEl) progress2BarEl.style.width = p2 + '%';
                    if (statsPanel) statsPanel.classList.remove('hidden');
                } else {
                    if (statsPanel) statsPanel.classList.add('hidden');
                    alert("Geometriile nu se intersectează.");
                }
            } catch (err) {
                console.error("Eroare intersecție Turf:", err);
                if (statsPanel) statsPanel.classList.add('hidden');
            }
        }
    });

    // =====================================================================
    // DRAW INTERACTION
    // =====================================================================

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
        if (drawInteraction) drawInteraction.abortDrawing();
        if (drawTypeSelect && drawTypeSelect.value !== 'None') {
            drawTypeSelect.value = 'None';
            drawTypeSelect.dispatchEvent(new Event('change'));
        }
    });

    function resetSentinelImageLayer() {
        map.removeLayer(sentinelImageLayer);
        sentinelImageLayer = new ol.layer.Image({ source: null, zIndex: 5 });
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
            console.log("Geometriile au fost șterse.");
        });
    }

    if (exportGeojsonBtn) {
        exportGeojsonBtn.addEventListener('click', function () {
            const features = drawSource.getFeatures();
            if (features.length === 0) { alert("Nu există geometrii desenate!"); return; }
            const geojsonObj = geojsonFormat.writeFeaturesObject(features, { featureProjection: map.getView().getProjection(), dataProjection: 'EPSG:4326' });
            const dlAnchor = document.createElement('a');
            dlAnchor.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojsonObj)));
            dlAnchor.setAttribute("download", "geometrii_exportate.geojson");
            document.body.appendChild(dlAnchor);
            dlAnchor.click();
            dlAnchor.remove();
        });
    }

    // =====================================================================
    // CALCUL DIMENSIUNI IMAGINE
    // =====================================================================

    function calcImageDimensions(bbox4326) {
        const [minLon, minLat, maxLon, maxLat] = bbox4326;
        const avgLat = (minLat + maxLat) / 2;
        const wM = (maxLon - minLon) * 111320 * Math.cos(avgLat * Math.PI / 180);
        const hM = (maxLat - minLat) * 110540;
        const MAX_RES = 195;
        const MAX_PX = 2000;
        return {
            w: Math.min(Math.max(Math.ceil(wM / MAX_RES), 64), MAX_PX),
            h: Math.min(Math.max(Math.ceil(hM / MAX_RES), 64), MAX_PX)
        };
    }

    // =====================================================================
    // COPERNICUS - FETCH IMAGINE + ANALIZA
    // =====================================================================

    if (fetchCopernicusBtn) {
        fetchCopernicusBtn.addEventListener('click', async function () {
            satelliteSource.clear();
            resetSentinelImageLayer();
            cloudPanel.style.display = 'none';

            // Citim modul de vizualizare selectat
            const selectedMode = vizModeSelect ? vizModeSelect.value : 'b02';
            currentAnalysisMode = selectedMode;

            // Actualizam eticheta butonului de analiza
            const analyzeLabel = selectedMode === 'ndvi' ? 'Analizează NDVI' : 'Analizează B02';
            if (analyzeBtn) analyzeBtn.textContent = analyzeLabel;

            let targetGeoJSON = null;
            const features = drawSource.getFeatures();

            if (features.length > 0) {
                try {
                    const geom = features[0].getGeometry();
                    const geom4326 = geom.clone().transform(map.getView().getProjection(), 'EPSG:4326');
                    if (geom4326.getType() === 'Polygon') {
                        targetGeoJSON = geojsonFormat.writeGeometryObject(geom4326);
                    } else {
                        const extent = geom4326.getExtent();
                        targetGeoJSON = {
                            type: "Polygon",
                            coordinates: [[[extent[0], extent[1]], [extent[2], extent[1]], [extent[2], extent[3]], [extent[0], extent[3]], [extent[0], extent[1]]]]
                        };
                    }
                } catch (e) { console.error("Eroare conversie geometrie:", e); }
            }

            if (!targetGeoJSON) {
                const extent4326 = ol.proj.transformExtent(map.getView().calculateExtent(map.getSize()), map.getView().getProjection(), 'EPSG:4326');
                targetGeoJSON = {
                    type: "Polygon",
                    coordinates: [[[extent4326[0], extent4326[1]], [extent4326[2], extent4326[1]], [extent4326[2], extent4326[3]], [extent4326[0], extent4326[3]], [extent4326[0], extent4326[1]]]]
                };
            }

            try {
                console.log("Se caută produse Sentinel...");
                const products = await searchSentinelProducts(targetGeoJSON);

                if (!products || products.length === 0) {
                    alert("Nu s-au găsit produse Sentinel 2 în această zonă.");
                    return;
                }

                products.forEach((product, index) => {
                    if (product.geometry) {
                        const olFeature = geojsonFormat.readFeature(product.geometry, { dataProjection: 'EPSG:4326', featureProjection: map.getView().getProjection() });
                        olFeature.set('id', product.id || `SENTINEL_PROD_${index}`);
                        if (product.properties) Object.keys(product.properties).forEach(k => olFeature.set(k, product.properties[k]));
                        satelliteSource.addFeatures([olFeature]);
                    }
                });

                console.log(`${products.length} produs(e) găsite.`);
                setDataExtent(satelliteSource.getExtent());

                const firstProduct = products[0];
                if (!firstProduct || !firstProduct.geometry) return;

                const geomFeature = geojsonFormat.readFeature(firstProduct.geometry, { dataProjection: 'EPSG:4326', featureProjection: 'EPSG:4326' });
                const bbox4326 = geomFeature.getGeometry().getExtent();
                const { w: imgW, h: imgH } = calcImageDimensions(bbox4326);
                const dateFrom = "2024-06-01T00:00:00Z";
                const dateTo = "2024-06-30T23:59:59Z";

                try {
                    // 1. Imaginea de DISPLAY (modul selectat)
                    console.log(`Se generează imaginea [${selectedMode}]...`);
                    const displayEvalscript = EVALSCRIPTS[selectedMode] || EVALSCRIPTS.b02;
                    const displayUrl = await fetchSentinelImage(bbox4326, dateFrom, dateTo, imgW, imgH, displayEvalscript);

                    const imageExtent3857 = ol.proj.transformExtent(bbox4326, 'EPSG:4326', map.getView().getProjection());
                    map.removeLayer(sentinelImageLayer);
                    sentinelImageLayer = new ol.layer.Image({
                        source: new ol.source.ImageStatic({
                            url: displayUrl,
                            imageExtent: imageExtent3857,
                            projection: map.getView().getProjection()
                        }),
                        opacity: 0.85,
                        zIndex: 5
                    });
                    map.addLayer(sentinelImageLayer);
                    setDataExtent(imageExtent3857);
                    console.log("Imagine afișată cu succes!");

                    // 2. Imaginea de ANALIZA (B02 sau NDVI grayscale, pentru canvas sampling)
                    const analysisEvalscript = selectedMode === 'ndvi' ? EVALSCRIPTS.ndvi_analysis : EVALSCRIPTS.b02;
                    const analysisUrl = selectedMode === 'b02'
                        ? displayUrl  // refolosim aceeasi imagine, evitam un API call in plus
                        : await fetchSentinelImage(bbox4326, dateFrom, dateTo, imgW, imgH, analysisEvalscript);

                    storeSentinelImageInCanvas(analysisUrl, bbox4326, imgW, imgH);

                } catch (imgErr) {
                    console.error("Eroare la generarea imaginii:", imgErr);
                    alert("Nu s-a putut genera imaginea satelitară. Verifică consola.");
                }

            } catch (error) {
                console.error("Eroare Sentinel Hub:", error);
                alert("Serverul a respins cererea. Verifică consola pentru detalii.");
            }
        });
    }
};