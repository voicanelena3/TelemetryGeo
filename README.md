TelemetryGeo is a GIS (Geographic Information System) designed for the visualization, processing, and analysis of geospatial data from satellites.
The main goal of this application is to ingest satellite metadata and translate it quickly and continuously into a dynamic visual representation on an
interactive 2D map.

This project helps solve a common challenge in aerospace and spatial engineering: transforming large volumes of abstract, raw data into an intuitive,
visual interface for researchers and operators.

Main functionalities:
-Automated Data Mapping: Upon initialization, the system automatically fetches and parses raw metadata from a production file
(for us: productResponse.json). It interprets the spatial sensor footprints, renders the polygons dynamically with a distinct color and 
smoothly adjusts the map's view to bound the loaded data.
-Multi-Format Manual Import: Users cand unpload their own geospatial files directly from their local drive. The application features an
intelligent dual-parsing engine that automatically identifies wheter the file contians standardized WKT (Well-Known-Text) or GeoJson data,
instantly mapping the shapes into a dedicated secondary vector layer
-Geocoding: Features an integrated search bar powered by the global GeoNames API. When a user types any location, the system queries the web service
in the background, extracts the mathematical coordinates, and performs a fluid flight animation (pan&zoom) to the destination.
