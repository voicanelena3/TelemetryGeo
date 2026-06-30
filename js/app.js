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

    // Layer pentru poligoanele "footprint" ale produselor Sentinel (raman afisate ca referinta)
    const satelliteSource = new ol.source.Vector();

    const satelliteLayer = new ol.layer.Vector({
        source: satelliteSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: 'rgba(255, 255, 255, 0.8)',
                width: 1.5
            }),
            fill: new ol.style.Fill({
                color: 'rgba(255, 255, 255, 0.05)'
            })
        })
    });
    map.addLayer(satelliteLayer);

    // Layer pentru imaginea reala Sentinel-2 (banda B02, normalizata), suprapusa pe harta
    let sentinelImageLayer = new ol.layer.Image({ source: null });
    map.addLayer(sentinelImageLayer);

    const vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#3388ff', width: 2 }),
            fill: new ol.style.Fill({ color: 'rgba(51, 136, 255, 0.2)' })
        }),
        zIndex: 20
    });
    map.addLayer(vectorLayer);

    const searchSource = new ol.source.Vector();
    const searchLayer = new ol.layer.Vector({
        source: searchSource,
        style: new ol.style.Style({
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: '#10b981' }), 
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            })
        }),
        zIndex: 30
    });
    map.addLayer(searchLayer);

    const drawSource = new ol.source.Vector();
    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({ color: 'rgba(255, 204, 51, 0.2)' }),
            stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2.5 }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({ color: '#ffcc33' }),
                stroke: new ol.style.Stroke({ color: '#1a1c1e', width: 1.5 })
            })
        }),
        zIndex: 40
    });
    map.addLayer(drawLayer);

    const intersectionSource = new ol.source.Vector();
    const intersectionLayer = new ol.layer.Vector({
        source: intersectionSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#ff0000', width: 4 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.5)' }),
            image: new ol.style.Circle({
                radius: 7,
                fill: new ol.style.Fill({ color: '#ff0000' }),
                stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 })
            })
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

        if (query.length > 0) {
            $('#clear-search').css('display', 'flex');
        } else {
            $('#clear-search').css('display', 'none');
        }

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

                        const searchFeature = new ol.Feature({
                            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
                        });
                        searchFeature.set('id', 'GeoNames: ' + location.name);
                        
                        searchSource.clear(); 
                        searchSource.addFeature(searchFeature); 

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

    $('#clear-search').on('click', function() {
        $('#search').val('').focus();
        $(this).css('display', 'none');
        $('#search-results').empty().hide();
        searchSource.clear();
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
        if (drawTypeSelect && drawTypeSelect.value !== 'None' && drawTypeSelect.value !== 'Navigare liberă') return;

        const clickedFeature = map.forEachFeatureAtPixel(e.pixel, function (feature, layer) {
            if (layer === intersectionLayer) return null;
            return feature;
        });

        if (!clickedFeature) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            removeStatsPanel();
            return;
        }

        if (selectedFeaturesArray.includes(clickedFeature)) {
            clickedFeature.setStyle(null);
            selectedFeaturesArray = selectedFeaturesArray.filter(f => f !== clickedFeature);
            intersectionSource.clear();
            removeStatsPanel();
            return;
        }

        if (selectedFeaturesArray.length === 2) {
            selectedFeaturesArray.forEach(f => f.setStyle(null));
            selectedFeaturesArray = [];
            intersectionSource.clear();
            removeStatsPanel();
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

                function makeSurface(feat) {
                    const type = turf.getType(feat);
                    if (type === 'Polygon' || type === 'MultiPolygon') {
                        return turf.buffer(feat, 0, { units: 'kilometers' });
                    } 
                    if (type === 'LineString') {
                        let coords = feat.geometry.coordinates;
                        if (coords.length >= 3) {
                            const firstPt = coords[0];
                            const lastPt = coords[coords.length - 1];
                            if (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1]) {
                                coords.push([...firstPt]);
                            }
                            try {
                                let poly = turf.polygon([coords]);
                                return turf.buffer(poly, 0, { units: 'kilometers' });
                            } catch (e) {
                                return feat;
                            }
                        }
                    }
                    return feat;
                }

                feat1 = makeSurface(feat1);
                feat2 = makeSurface(feat2);

                let intersectie = null;
                
                try {
                    intersectie = turf.intersect(turf.featureCollection([feat1, feat2]));
                } catch (versionError) {
                    intersectie = turf.intersect(feat1, feat2);
                }

                if (intersectie && (intersectie.geometry || (intersectie.features && intersectie.features.length > 0))) {
                    
                    const geojsonCollection = intersectie.type === 'FeatureCollection' ? intersectie : turf.featureCollection([intersectie]);
                    const olIntersectieArray = geojsonFormat.readFeatures(geojsonCollection, {
                        dataProjection: 'EPSG:4326', 
                        featureProjection: map.getView().getProjection()
                    });
                    intersectionSource.addFeatures(olIntersectieArray);

                    const areaInSquareMeters = turf.area(intersectie);
                    const areaInSquareKm = areaInSquareMeters / 1000000;
                    
                    const areaPolygon1 = turf.area(feat1);
                    const areaPolygon2 = turf.area(feat2);

                    const overlapPercent1 = areaPolygon1 ? (areaInSquareMeters / areaPolygon1) * 100 : 0;
                    const overlapPercent2 = areaPolygon2 ? (areaInSquareMeters / areaPolygon2) * 100 : 0;

                    document.querySelector('.metric-unit').innerText = "km²";
                    updateAndShowStatsPanel(areaInSquareKm, overlapPercent1, overlapPercent2);

                } else {
                    alert("Geometriile selectate nu se suprapun.");
                    selectedFeaturesArray.forEach(f => f.setStyle(null));
                    selectedFeaturesArray = [];
                    intersectionSource.clear();
                    removeStatsPanel();
                }
            } catch (err) {
                console.error("Eroare la calcul intersecție:", err);
                alert("A apărut o eroare la calculul intersecției.");
                selectedFeaturesArray.forEach(f => f.setStyle(null));
                selectedFeaturesArray = [];
                intersectionSource.clear();
                removeStatsPanel();
            }
        }
    });

    let drawInteraction, snapInteraction;

    // DEFINIREA CORECTĂ A BUTONULUI COPERNICUS
    const fetchCopernicusBtn = document.getElementById('btn-fetch-copernicus');

    function addDrawInteraction() {
        if (!drawTypeSelect) return;
        let value = drawTypeSelect.value;
        if (value === 'Navigare liberă') value = 'None';

        if (value !== 'None') {
            drawInteraction = new ol.interaction.Draw({ source: drawSource, type: value });
            map.addInteraction(drawInteraction);
            
            snapInteraction = new ol.interaction.Snap({ source: drawSource, pixelTolerance: 15 });
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

            // Curatam si imaginea Sentinel reala afisata pe harta
            map.removeLayer(sentinelImageLayer);
            sentinelImageLayer = new ol.layer.Image({ source: null });
            map.addLayer(sentinelImageLayer);

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

    // LISTENERUL CORECT PENTRU INTEROGAREA API-ULUI COPERNICUS
    if (fetchCopernicusBtn) {
        fetchCopernicusBtn.addEventListener('click', async function () {
            satelliteSource.clear();

            // Curatam imaginea Sentinel veche, daca exista una de la o cautare anterioara
            map.removeLayer(sentinelImageLayer);
            sentinelImageLayer = new ol.layer.Image({ source: null });
            map.addLayer(sentinelImageLayer);

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
                                    [extent[0], extent[1]],
                                    [extent[2], extent[1]],
                                    [extent[2], extent[3]],
                                    [extent[0], extent[3]],
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
                        [extent4326[0], extent4326[1]],
                        [extent4326[2], extent4326[1]],
                        [extent4326[2], extent4326[3]],
                        [extent4326[0], extent4326[3]],
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

                // Desenam footprint-urile (conturul) tuturor produselor gasite
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

                // Generam si afisam imaginea REALA Sentinel-2 (banda B02, normalizata)
                // pentru primul produs gasit
                const firstProduct = products[0];
                if (firstProduct && firstProduct.geometry) {
                    const geomFeature = geojsonFormat.readFeature(firstProduct.geometry, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: 'EPSG:4326' // ramanem in 4326 ca sa calculam bbox-ul corect
                    });
                    const bbox4326 = geomFeature.getGeometry().getExtent();

                    // Acelasi interval de timp folosit si la cautarea in catalog
                    const dateFrom = "2024-06-01T00:00:00Z";
                    const dateTo = "2024-06-30T23:59:59Z";

                    // Calculam dinamic latimea/inaltimea imaginii in functie de marimea bbox-ului,
                    // ca sa respectam limita de rezolutie a Sentinel Hub (max 200 m/pixel pt S2L1C)
                    // si limita superioara de pixeli acceptata de API (~2500 x 2500)
                    const [minLon, minLat, maxLon, maxLat] = bbox4326;
                    const lonDiff = maxLon - minLon;
                    const latDiff = maxLat - minLat;

                    // Conversie aproximativa grade -> metri (la latitudinea medie a zonei)
                    const avgLat = (minLat + maxLat) / 2;
                    const metersPerDegLon = 111320 * Math.cos(avgLat * Math.PI / 180);
                    const metersPerDegLat = 110540;

                    const widthMeters = lonDiff * metersPerDegLon;
                    const heightMeters = latDiff * metersPerDegLat;

                    const MAX_RES_M_PER_PX = 195; // putin sub limita de 200, ca rezerva
                    const MAX_PIXELS = 2000; // sub limita maxima a API-ului, ca rezerva

                    let imgWidth = Math.ceil(widthMeters / MAX_RES_M_PER_PX);
                    let imgHeight = Math.ceil(heightMeters / MAX_RES_M_PER_PX);

                    // Limitam la maximul acceptat
                    imgWidth = Math.min(Math.max(imgWidth, 64), MAX_PIXELS);
                    imgHeight = Math.min(Math.max(imgHeight, 64), MAX_PIXELS);

                    console.log(`Dimensiuni calculate pentru imagine: ${imgWidth}x${imgHeight} px`);

                    try {
                        console.log("Se genereaza imaginea Sentinel-2 (banda B02)...");
                        const imageUrl = await fetchSentinelImage(bbox4326, dateFrom, dateTo, imgWidth, imgHeight);

                        const imageExtent3857 = ol.proj.transformExtent(
                            bbox4326,
                            'EPSG:4326',
                            map.getView().getProjection()
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