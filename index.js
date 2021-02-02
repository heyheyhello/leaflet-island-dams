/// <reference path="leaflet.d.ts" />
const L = window.L;

// Elements
const elMap = document.querySelector('#map');
const elLatLng = document.querySelector('#latlng-text');
const elMarkerCount = document.querySelector('#marker-count-text');
const elLog = document.querySelector('#log-text');
const elSidebar = document.querySelector('aside');

// Text formatters
const textLatLng = (lat, lng) => {
  elLatLng.innerText = `LatLng: (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}
const textMarkerCount = (count = 0) => {
  elMarkerCount.innerText = `${count}/${markersLayerGroup.getLayers().length} visible`;
};
const textLog = (...msg) => {
  elLog.innerText += `> ${msg.join(' ')}\n`;
  // To view non-serializables in the console like objects
  console.log(...msg);
}

window.addEventListener('error', ev => {
  textLog(ev.error.name, ev.error.message);
});
window.addEventListener('unhandledrejection', ev => {
  textLog(ev.reason);
});

// Map stuff
const startLatLng = [48.50569, -123.56461];

const map = new L.Map(elMap, {
  center: startLatLng,
  zoom: 10,
});
map.addEventListener('mousemove', ev => {
  const { lat, lng } = ev.latlng;
  textLatLng(lat, lng);
});

const tiles = new L.TileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  subdomains: ['a','b','c'],
});
tiles.addTo(map);

// TODO: On marker hover, change colour?

const geoLayerGroup = new L.GeoJSON();
geoLayerGroup.addTo(map);

// TODO: Dynamically set an expression with a UI slider? Esp for "year" and number ranges
const markersLayerGroup = new L.LayerGroup();
markersLayerGroup.addTo(map);

const mapPropToValToMarkers = new Map(); // <string (prop key), Map<string (prop value), Layer[]>>

const propKeysWorthIndexing = [
  // "DAM_NAME",
  // "DAM_FILE_NO",
  // "ALTERNATE_DAM_NAME",
  // "DAM_OWNER",
  // "REGION_NAME", // All of these are "VANCOUVER ISLAND" or null/empty
  "DISTRICT_PRECINCT_NAME",
  "DAM_TYPE",
  // "SPILLWAY_TYPE", // No data
  "DAM_FUNCTION",
  "COMMISSIONED_YEAR",
  // "DAM_HEIGHT_IN_METRES",
  // "CREST_ELEVATION_IN_METRES",
  // "CREST_LENGTH_IN_METRES",
  "FAILURE_CONSEQUENCE",
  "RISK_LEVEL",
  // "POINTS_CODE",
  "DAM_REGULATED_CODE",
  "DAM_OPERATION_CODE",
  "DAM_SAFETY_OFFICER",
  // "FEATURE_LENGTH_M",
  // "OBJECTID",
  // "SE_ANNO_CAD_DATA",
  // "GEOMETRY.LEN",
  // "fme_feature_type",
]

const redoMarkerCount = () => {
  const mapBounds = map.getBounds();
  let count = 0;
  markersLayerGroup.eachLayer(layer => {
    if (mapBounds.contains(layer.getLatLng())) {
      count++;
    }
  });
  textMarkerCount(count);
};

const sleep = ms => new Promise((res, rej) => setTimeout(res, ms));

(async () => {
  const data = await fetch('./WRIS_DAMS_PUBLIC_SVW.geojson').then(res => res.json())
  textLog(`Loaded "${data.name}" with ${data.features.length} features`);
  // Calling addData does a lot of work to get everything onto the screen. If we
  // start doing all the number crunching and marker generation immediately then
  // the main thread is blocked long enough that the user is looking at a blank
  // page. Using sleep() defers to allow the map to paint...
  geoLayerGroup.addData(data);
  await sleep(1000);
  for (const layer of geoLayerGroup.getLayers()) {
    // Create marker
    const center = layer.getBounds().getCenter();
    const marker = new L.Marker(center);
    const prop = layer.feature.properties;
    const div = document.createElement('div');
    div.innerHTML = `
      <strong>${prop.DAM_NAME}</strong>
      <div style='font-size: 90%'>
        <div>Owner: ${prop.DAM_OWNER}</div>
        <div><em>${prop.DAM_TYPE}</em></div>
        <div>Risk: ${prop.RISK_LEVEL || '❓'}</div>
      </div>
    `;
    const a = document.createElement('a');
    a.innerText = 'Info';
    // TODO: Perf. Creates/Holds about 350 arrow functions...
    a.addEventListener('click', ev => {
      textLog(`Marker ${marker.getLatLng()}: ${JSON.stringify(prop, null, 2)}`);
    });
    div.appendChild(a);
    marker.bindPopup(div);
    markersLayerGroup.addLayer(marker);

    // Create collection bucket for each property value
    for (const prop of propKeysWorthIndexing) {
      const value = layer.feature.properties[prop] || '❓'
      let mapValToMarkers = mapPropToValToMarkers.get(prop);
      if (mapValToMarkers === undefined) {
        mapValToMarkers = new Map();
        mapPropToValToMarkers.set(prop, mapValToMarkers);
      }
      let markers = mapValToMarkers.get(String(value));
      if (markers === undefined) {
        markers = [];
        mapValToMarkers.set(String(value), markers);
      }
      markers.push(marker);
    }
  }
  // Remove the "Loading..." message
  elSidebar.innerHTML = '';
  // Could also get order by [...mapPropToValToMarkers.keys()].sort()
  for (const prop of propKeysWorthIndexing) {
    const mapValToMarkers = mapPropToValToMarkers.get(prop);
    const div = document.createElement('div');
    const header = document.createElement('p');
    header.append(`${prop} (${mapValToMarkers.size})`);
    header.className = 'category';
    div.appendChild(header);
    for (const val of [...mapValToMarkers.keys()].sort()) {
      const markers = mapValToMarkers.get(val);
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = true;
      // TODO: Perf. This creates ~3000 arrow functions in memory (oof)
      input.addEventListener('change', () => {
        const shouldAdd = input.checked;
        for (const marker of markers) {
          if (shouldAdd) {
            markersLayerGroup.addLayer(marker);
          } else {
            markersLayerGroup.removeLayer(marker);
          }
        }
        textLog(`${shouldAdd ? 'Added' : 'Removed'} ${markers.length} markers`);
        redoMarkerCount();
      });
      label.appendChild(input);
      label.append(`${val} (${markers.length})`);
      div.appendChild(label);
    }
    elSidebar.appendChild(div);
  }
  textLog('Done');
  redoMarkerCount();
})();

textLatLng(...startLatLng);
map.addEventListener('layeradd', redoMarkerCount);
map.addEventListener('layerremove', redoMarkerCount);
map.addEventListener('moveend', redoMarkerCount);
