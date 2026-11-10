TelemetryGeo is a GIS (Geographic Information System) designed for the visualization, processing, and analysis of geospatial data from satellites.
The main goal of this application is to ingest satellite metadata and translate it quickly and continuously into a dynamic visual representation on an
interactive 2D map.

This project helps solve a common challenge in aerospace and spatial engineering: transforming large volumes of abstract, raw data into an intuitive,
visual interface for researchers and operators.

### Prerequisites
To run this project locally, you only need a modern web browser like Edge, Chrome, or Firefox, alongside a local development environment server such as the VS Code Live Server extension, Python's built-in http.server, or Node.js http-server.

Since the app connects directly to secure external APIs from a local address, a browser extension for CORS (Cross-Origin Resource Sharing) permission needs to be installed and active during development to avoid Preflight (OPTIONS) blockages imposed by the browser.

### Architecture & Tech Stack
-This platform is engineered to run completely client-side, avoiding heavy backend infrastructures or database lags.
-The mapping engine is built on OpenLayers v10.3.1, using a multi-layer spatial stack composed of Base OSM, Draw, Manual Vectors, Satellite Scenes, and Intersections.
-The geospatial math engine utilizes Turf.js for topology analysis and polygon intersection buffering.
-The API protocols rely on the native RESTful Fetch API using asynchronous HTTP POST requests powered by OAuth2 Bearer Tokens.
-The UI controls are managed through jQuery and Native CSS3 for asynchronous search pop-ups and custom controls.



### Step-by-Step Setup
Clone the repository locally using Git by running the command git clone https://github.com/voicanelena3/TelemetryGeo.git followed by cd TelemetryGeo.

The file structure in your workspace must contain index.html for the main interface, app.js for map initialization and UI events, and copernicus-api.js to handle OAuth2 authentication and dispatch requests to the Sentinel Hub catalog.

Launch the local server by right-clicking index.html and selecting Open with Live Server, or by starting your preferred local server on port 5500.

Initialize the map by first enabling your browser's CORS extension, then opening the developer console (F12) to verify the startup logs for the widgets.
   

### Running with Docker
The repository includes a `Dockerfile` (nginx:alpine) and a `docker-compose.yml`. With Docker Desktop running:

```bash
docker compose up -d --build
```

Then open http://localhost:5500. Stop it with `docker compose down`.

When served from the container, Nginx proxies the Sentinel Hub API under `/sentinel-hub/` (see `docker/nginx.conf`), so the browser makes same-origin requests and **no CORS extension is needed**. The container exposes a health endpoint at `/health`.

Without Compose:

```bash
docker build -t telemetry-geo .
docker run -d -p 5500:80 --name telemetry-geo-app telemetry-geo
```
