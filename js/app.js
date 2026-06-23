window.onload = function() {
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

    const satelliteSource = new ol.source.Vector();
    const satelliteLayer = new ol.layer.Vector({
        source: satelliteSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#ff5500', 
                width: 2
            }),
            fill: new ol.style.Fill({
                color: 'rgba(255, 85, 0, 0.15)' 
            })
        })
    });
    map.addLayer(satelliteLayer);

    $.ajax({
        url: 'productResponse.json',
        method: 'GET',
        dataType: 'json',
        success: function(response) {
            const featuresArray = [];

            if (response && response.data && response.data.length > 0) {
                response.data.forEach(function(product) {
                    if (product.geometry) {
                        try {
                            const feature = wktFormat.readFeature(product.geometry, {
                                dataProjection: 'EPSG:4326', 
                                featureProjection: map.getView().getProjection() 
                            });

                            feature.set('acquisitionDate', product.acquisitionDate);
                            feature.set('id', product.id);

                            featuresArray.push(feature);
                        } catch (e) {
                            console.error("Eroare la citirea unei geometrii WKT individuale:", e);
                        }
                    }
                });

                if (featuresArray.length > 0) {
                    satelliteSource.addFeatures(featuresArray);

                    map.getView().fit(satelliteSource.getExtent(), {
                        duration: 1500,
                        padding: [50, 50, 50, 50]
                    });
                    console.log(`Succes! S-au încărcat automat ${featuresArray.length} produse satelitare pe hartă.`);
                }
            } else {
                console.warn("Structura fișierului JSON nu conține array-ul 'data' sau acesta este gol.");
            }
        },
        error: function(xhr, status, error) {
            console.error("Eroare la încărcarea fișierului productResponse.json: ", status, error);
        }
    });

    const vectorSource = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
        source: vectorSource,
        style: new ol.style.Style({
            stroke: new ol.style.Stroke({
                color: '#3388ff', 
                width: 2
            }),
            fill: new ol.style.Fill({
                color: 'rgba(51, 136, 255, 0.2)'
            })
        })
    });
    map.addLayer(vectorLayer);

    $('#json-file').on('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const response = JSON.parse(event.target.result);
                vectorSource.clear(); 

                const manualFeaturesArray = [];

                if (response && response.data && response.data.length > 0) {
                    response.data.forEach(function(product) {
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
                } 
                else if (response.type === "FeatureCollection" || response.type === "Feature") {
                    const geojsonFormat = new ol.format.GeoJSON();
                    const geojsonFeatures = geojsonFormat.readFeatures(response, {
                        dataProjection: 'EPSG:4326',
                        featureProjection: map.getView().getProjection()
                    });
                    manualFeaturesArray.push(...geojsonFeatures);
                }

                if (manualFeaturesArray.length > 0) {
                    vectorSource.addFeatures(manualFeaturesArray);

                    map.getView().fit(vectorSource.getExtent(), {
                        duration: 1200,
                        padding: [50, 50, 50, 50]
                    });
                    console.log(`Urcat manual cu succes: ${manualFeaturesArray.length} geometrii.`);
                } else {
                    alert("Nu s-au găsit geometrii valide în fișierul selectat.");
                }
            } catch (error) {
                console.error("Eroare la parsarea JSON-ului:", error);
                alert("Fișierul selectat nu este un JSON valid.");
            }
        };
        reader.readAsText(file);
    });


   
    $('#search').on('keypress', function(e) {
        if (e.which === 13) {
            const query = $(this).val().trim();
            if (!query) return;
            
            const geonamesUsername = 'bambiiiiiiiiiiiiiiii';
            
            const geonamesUrl = `https://secure.geonames.org/searchJSON?q=${encodeURIComponent(query)}&maxRows=1&username=${geonamesUsername}`;

            $(this).css('opacity', '0.5');

            $.ajax({
                url: geonamesUrl,
                method: 'GET',
                dataType: 'json',
                success: function(data) {
                    if (data && data.geonames && data.geonames.length > 0) {
                        const location = data.geonames[0];
                        
                        const lon = parseFloat(location.lng);
                        const lat = parseFloat(location.lat);

                        console.log(`[GeoNames] Navigăm către: ${location.name}, ${location.countryName} [${lon}, ${lat}]`);

                        map.getView().animate({
                            center: ol.proj.fromLonLat([lon, lat]),
                            zoom: 12,
                            duration: 1500,
                            easing: ol.easing.easeOut
                        });
                        
                        $('#search').val(''); 
                    } else {
                        alert("Locația nu a fost găsită de GeoNames.");
                    }
                },
                error: function(xhr, status, error) {
                    console.error("Eroare căutare GeoNames: ", status, error);
                    alert("A apărut o eroare la căutarea locației.");
                },
                complete: function() {
                    $('#search').css('opacity', '1');
                }
            });
        }
    });

    const drawSource = new ol.source.Vector();
    const drawLayer = new ol.layer.Vector({
        source: drawSource,
        style: new ol.style.Style({
            fill: new ol.style.Fill({
                color: 'rgba(255, 204, 51, 0.3)'
            }),
            stroke: new ol.style.Stroke({
                color: '#ffcc33',
                width: 2.5
            }),
            image: new ol.style.Circle({
                radius: 6,
                fill: new ol.style.Fill({
                    color: '#ffcc33'
                }),
                stroke: new ol.style.Stroke({
                    color: '#1a1c1e',
                    width: 1.5
                })
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
            drawInteraction = new ol.interaction.Draw({
                source: drawSource,
                type: value
            });
            map.addInteraction(drawInteraction);
            
            snapInteraction = new ol.interaction.Snap({
                source: drawSource,
                pixelTolerance: 15
            });
            map.addInteraction(snapInteraction);

            document.getElementById('map').style.cursor = 'crosshair';
        } else {
            document.getElementById('map').style.cursor = 'default';
        }
    }

    drawTypeSelect.addEventListener('change', function () {
        if (drawInteraction) {
            map.removeInteraction(drawInteraction);
        }
        if (snapInteraction) {
            map.removeInteraction(snapInteraction);
        }
        addDrawInteraction();
    });

    clearDrawButton.addEventListener('click', function() {
        if(confirm("Ești sigur că vrei să ștergi desenele de pe hartă? Datele satelitare vor fi păstrate.")) {
            if (drawInteraction) {
                drawInteraction.abortDrawing();
            }
            if (typeof drawSource !== 'undefined') {
                drawSource.clear();
            }
            
            console.log("Desenele manuale au fost șterse, datele din fișier au rămas intacte.");
        }
    });

    addDrawInteraction();
};