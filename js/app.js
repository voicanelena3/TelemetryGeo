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
            stroke: new ol.style.Stroke({ color: '#ff5500', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 85, 0, 0.12)' })
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

    const drawSource = new ol.source.Vector();
    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(255, 204, 51, 0.2)' }),
            stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2.5 })
        })
    });
    map.addLayer(drawLayer);

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
    const clearDrawButton = document.getElementById('clear-draw') || document.querySelector('.btn-danger') || document.getElementById('clear-btn');
    const exportGeojsonBtn = document.getElementById('export-geojson') || document.querySelector('button[id*="export"]') || document.querySelector('.btn-primary:not(#btn-fetch-copernicus)');

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

    if (clearDrawButton) {
        clearDrawButton.addEventListener('click', function () {
            drawSource.clear();
            satelliteSource.clear();
            intersectionSource.clear();
            vectorSource.clear();
            selectedFeaturesArray = [];
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

    const fetchCopernicusBtn = document.getElementById('btn-fetch-copernicus') || document.querySelector('button[class*="blue"]');
    if (fetchCopernicusBtn) {
        fetchCopernicusBtn.addEventListener('click', function () {
            satelliteSource.clear();

            let targetGeoJSON = null;
            const features = drawSource.getFeatures();

            if (features.length > 0) {
                try {
                    const userGeom = features[0].getGeometry().clone();
                    userGeom.transform(map.getView().getProjection(), 'EPSG:4326');
                    targetGeoJSON = geojsonFormat.writeGeometryObject(userGeom);
                    targetGeoJSON = turf.buffer(turf.feature(targetGeoJSON), 0, { units: 'kilometers' });
                } catch (e) {
                    targetGeoJSON = null;
                }
            }

            if (!targetGeoJSON) {
                const extent = map.getView().calculateExtent(map.getSize());
                const extent4326 = ol.proj.transformExtent(extent, map.getView().getProjection(), 'EPSG:4326');
                targetGeoJSON = turf.polygon([[
                    [Math.max(extent4326[0], -179), Math.max(extent4326[1], -80)],
                    [Math.min(extent4326[2], 179), Math.max(extent4326[1], -80)],
                    [Math.min(extent4326[2], 179), Math.min(extent4326[3], 80)],
                    [Math.max(extent4326[0], -179), Math.min(extent4326[3], 80)],
                    [Math.max(extent4326[0], -179), Math.max(extent4326[1], -80)]
                ]]);
            }

            if (targetGeoJSON.type === 'Feature') {
                targetGeoJSON = targetGeoJSON.geometry;
            }

            const bbox = turf.bbox(targetGeoJSON);
            const minX = bbox[0], minY = bbox[1], maxX = bbox[2], maxY = bbox[3];
            
            const width = maxX - minX;
            const height = maxY - minY;

            let count = 0;
            const sizeX = width / 2.5;
            const sizeY = height / 2.5;

            for (let i = 0; i < 3; i++) {
                const startX = minX + (i * sizeX * 0.7);
                const startY = minY + (i * sizeY * 0.6);

                const tile = turf.polygon([[
                    [startX, startY],
                    [startX + sizeX, startY + (sizeY * 0.1)],
                    [startX + (sizeX * 0.9), startY + sizeY],
                    [startX - (sizeX * 0.1), startY + (sizeY * 0.9)],
                    [startX, startY]
                ]]);

                try {
                    let finalGeom = tile.geometry;
                    const intersection = turf.intersect(turf.featureCollection([targetGeoJSON, tile.geometry]));
                    if (intersection) {
                        finalGeom = intersection.geometry || intersection;
                    }

                    const olFeature = geojsonFormat.readFeature(finalGeom, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: map.getView().getProjection()
                    });
                    olFeature.set('id', 'SENTINEL-PRODUCT-MOCK-' + count);
                    satelliteSource.addFeatures([olFeature]);
                    count++;
                } catch (err) {
                    const olFeature = geojsonFormat.readFeature(tile.geometry, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: map.getView().getProjection()
                    });
                    satelliteSource.addFeatures([olFeature]);
                    count++;
                }
            }

            console.log(`S-au generat ${count} amprente de produse satelitare.`);
        });
    }
};