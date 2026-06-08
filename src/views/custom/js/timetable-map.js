/* global document, maplibregl, Pbf, mapStyleUrl, stopData, routeData, routeIds, tripIds, geojsons, gtfsRealtimeUrls, loadMapStyleWithWorkingFonts */
/* eslint prefer-arrow-callback: "off", no-unused-vars: "off" */

const maps = {};
const vehicleMarkers = {};
const vehicleMarkersEventListeners = {};
let vehiclePositions;
let tripUpdates;
let vehiclePopup;
let stopPopup; // Popup for stop info
let currentStopPopupFeature = null; // Track feature for refreshing popup content
let gtfsRealtimeInterval;
let rtPositionsPaused = false;
let previousVehicleCount = null;
let dataFetchTimestamp = null; // Timestamp (in seconds) when GTFS-RT data was fetched

// Configuration flag: when true, only show vehicle markers that match the
// direction_id of the currently visible map. When false, show all vehicles.
const filterVehiclesByDirection = true;

function formatRouteColor(route) {
  return route.route_color || '#000000';
}

function formatRouteTextColor(route) {
  return route.route_text_color || '#FFFFFF';
}

function degToCompass(num) {
  var val = Math.floor(num / 22.5 + 0.5);
  var arr = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return arr[val % 16];
}

function metersPerSecondToMph(metersPerSecond) {
  return metersPerSecond * 2.23694;
}

function formatSpeed(mph) {
  return `${Math.round(mph * 10) / 10} mph`;
}

function formatSeconds(seconds) {
  return seconds < 60 ? Math.floor(seconds) + ' sec' : Math.floor(seconds / 60) + ' min';
}

function formatRoute(route) {
  const tag = route.route_short_name ? 'a' : 'div';
  const href = route.route_short_name ? ` href="/${route.route_short_name}"` : '';

  let swatchHtml = '';
  if (route.route_color) {
    swatchHtml = `<div class="route-color-swatch" style="background-color:${formatRouteColor(route)};color:${formatRouteTextColor(route)}">${route.route_short_name ?? ''}</div>`;
  }

  const nameHtml = `<div class="underline-hover">${route.route_long_name ?? `Route ${route.route_short_name}`}</div>`;

  return `<${tag}${href} class="map-route-item">${swatchHtml}${nameHtml}</${tag}>`;
}

function getStopPopupHtml(feature, stop) {
  const routeIds = JSON.parse(feature.properties.route_ids);
  let html = `<div data-stop-id="${stop.stop_id}">`;

  const visibleTimetable = document.querySelector('.timetable:not([style*="display: none"])');
  const timetableRouteId = visibleTimetable ? visibleTimetable.dataset.routeId : null;
  const firstRouteId = timetableRouteId ? String(timetableRouteId).split('_')[0] : null;
  const currentRoute =
    firstRouteId && typeof routeData !== 'undefined' ? routeData[firstRouteId] : null;
  const routeLabel = currentRoute?.route_short_name ? `${currentRoute.route_short_name} ` : '';

  html += `<div class="popup-title">${stop.stop_name}${stop.stop_code ? ` (${stop.stop_code})` : ''}</div>`;

  if (tripUpdates) {
    const stopTimeUpdates = { 0: [], 1: [] };

    for (const tripUpdate of tripUpdates) {
      const stopTimeUpdatesForStop = tripUpdate.trip_update.stop_time_update.filter(
        (stopTimeUpdate) =>
          stopTimeUpdate.stop_id === stop.stop_id &&
          (stopTimeUpdate.departure !== null || stopTimeUpdate.arrival !== null) &&
          stopTimeUpdate.schedule_relationship !== 3,
      );
      if (stopTimeUpdatesForStop.length > 0) {
        stopTimeUpdates[tripUpdate.trip_update.trip.direction_id].push(...stopTimeUpdatesForStop);
      }
    }

    stopTimeUpdates['0'].sort((a, b) => {
      const timeA = a.departure ? a.departure.time : a.arrival.time;
      const timeB = b.departure ? b.departure.time : b.arrival.time;
      return timeA - timeB;
    });

    stopTimeUpdates['1'].sort((a, b) => {
      const timeA = a.departure ? a.departure.time : a.arrival.time;
      const timeB = b.departure ? b.departure.time : b.arrival.time;
      return timeA - timeB;
    });

    if (stopTimeUpdates['0'].length > 0 || stopTimeUpdates['1'].length > 0) {
      html += `<div class="popup-label">Upcoming ${routeLabel}Departures:</div>`;

      for (const direction of ['0', '1']) {
        if (stopTimeUpdates[direction].length > 0) {
          const dirEl = document.querySelector(`.timetable[data-direction-id="${direction}"]`);
          const directionName = dirEl ? dirEl.dataset.directionName : '';
          const departureTimes = stopTimeUpdates[direction].map((stopTimeUpdate) =>
            Math.round(
              ((stopTimeUpdate.departure
                ? stopTimeUpdate.departure.time
                : stopTimeUpdate.arrival.time) -
                Date.now() / 1000) /
                60,
            ),
          );

          const formattedDepartures = new Intl.ListFormat('en', {
            style: 'long',
            type: 'conjunction',
          }).format(departureTimes.slice(0, 4).map((time) => `<b>${time}</b>`));

          html += `<div><b>${directionName}</b> in ${formattedDepartures} min</div>`;
        }
      }
    }
  }

  html += `<div class="popup-label">Routes Served:</div>`;
  html += `<ul class="route-list flex flex-wrap gap-2 list-none p-0 my-2">`;

  routeIds.forEach((routeId) => {
    const route = routeData[routeId];
    if (!route) return;
    html += `<li><a href="/${route.route_short_name}"><span class="route-color-swatch" style="background-color:${formatRouteColor(route)};color:${formatRouteTextColor(route)}" aria-hidden="true">${route.route_short_name ?? ''}</span><span class="sr-only">Route ${route.route_short_name}</span></a></li>`;
  });

  html += `</ul>`;

  html += `<a class="btn-blue btn-sm" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${feature.geometry.coordinates[1]},${feature.geometry.coordinates[0]}&heading=0&pitch=0&fov=90" target="_blank" rel="noopener noreferrer">View on Streetview <i class="bi bi-box-arrow-up-right ml-2" aria-hidden="true"></i> <span class="sr-only">opens external site</span></a>`;

  html += `</div>`;
  return html;
}

function getBounds(geojson) {
  const bounds = new maplibregl.LngLatBounds();
  for (const feature of geojson.features) {
    if (feature.geometry.type.toLowerCase() === 'point') {
      bounds.extend(feature.geometry.coordinates);
    } else if (feature.geometry.type.toLowerCase() === 'linestring') {
      for (const coordinate of feature.geometry.coordinates) {
        bounds.extend(coordinate);
      }
    } else if (feature.geometry.type.toLowerCase() === 'multilinestring') {
      for (const linestring of feature.geometry.coordinates) {
        for (const coordinate of linestring) {
          bounds.extend(coordinate);
        }
      }
    }
  }

  return bounds;
}

function secondsInFuture(dateString) {
  // Takes a dateString in the format of "YYYYMMDD HH:mm:ss" and returns true if the date is more than 15 minutes in the future

  const inputDate = new Date(
    dateString.substring(0, 4), // Year
    dateString.substring(4, 6) - 1, // Month (zero-indexed)
    dateString.substring(6, 8), // Day
    dateString.substring(9, 11), // Hours
    dateString.substring(12, 14), // Minutes
    dateString.substring(15, 17), // Seconds
  );

  const now = new Date();
  const diffInMilliseconds = inputDate - now;
  const diffInSeconds = Math.floor(diffInMilliseconds / 1000);

  // If the date is in the future, return the number of seconds, otherwise return 0
  return diffInSeconds > 0 ? diffInSeconds : 0;
}

function formatMovingText(vehiclePosition) {
  let movingText = '';

  if (
    (vehiclePosition.vehicle.position.bearing !== undefined &&
      vehiclePosition.vehicle.position.bearing !== 0) ||
    vehiclePosition.vehicle.position.speed
  ) {
    movingText += 'Moving ';
  }

  if (
    vehiclePosition.vehicle.position.bearing !== undefined &&
    vehiclePosition.vehicle.position.bearing !== 0
  ) {
    movingText += degToCompass(vehiclePosition.vehicle.position.bearing);
  }
  if (vehiclePosition.vehicle.position.speed) {
    movingText += ` at ${formatSpeed(
      metersPerSecondToMph(vehiclePosition.vehicle.position.speed),
    )}`;
  }

  return movingText;
}

function getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate) {
  let html = `<div id="vehicle-popup-${vehiclePosition.vehicle.vehicle.id}">`;

  const lastUpdated = new Date(vehiclePosition.vehicle.timestamp * 1000);
  const tripEl = document.querySelector(
    '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
  );
  const directionName = tripEl ? tripEl.closest('.timetable').dataset.directionName : null;

  if (directionName) {
    html += `<div class="popup-title">Vehicle: ${directionName}</div>`;
  }

  const movingText = formatMovingText(vehiclePosition);

  if (movingText) {
    html += `<div>${movingText}</div>`;
  }

  const numberOfArrivalsToShow = 5;
  const nextArrivals = [];
  const referenceTime = dataFetchTimestamp || Date.now() / 1000;
  if (vehicleTripUpdate && vehicleTripUpdate.trip_update.stop_time_update) {
    for (const stoptimeUpdate of vehicleTripUpdate.trip_update.stop_time_update) {
      if (stoptimeUpdate.arrival) {
        const secondsToArrival = stoptimeUpdate.arrival.time - referenceTime;
        const stopName = stopData[stoptimeUpdate.stop_id]?.stop_name;

        if (secondsToArrival > 0 && stopName) {
          nextArrivals.push({
            delay: stoptimeUpdate.arrival.delay,
            secondsToArrival,
            stopName,
          });
        }

        if (nextArrivals.length >= numberOfArrivalsToShow) {
          break;
        }
      }
    }
  }

  if (nextArrivals.length > 0) {
    html += `<div class="upcoming-stops"><div>Time</div><div>Upcoming Stop</div>`;
    for (const arrival of nextArrivals) {
      let delay = '';
      if (arrival.delay > 0) {
        delay = `(${formatSeconds(arrival.delay)} behind schedule)`;
      } else if (arrival.delay < 0) {
        delay = `(${formatSeconds(arrival.delay)} ahead of schedule)`;
      }
      html += `<div>${formatSeconds(arrival.secondsToArrival)}</div><div>${arrival.stopName} ${delay}</div>`;
    }
    html += `</div>`;
  }

  html += `<div class="vehicle-updated">Updated: ${lastUpdated.toLocaleTimeString()}</div>`;
  html += `</div>`;

  return html;
}

function updateRtPositionsContainer(vehiclePositions, tripUpdates) {
  const currentVehicleCount = vehiclePositions ? vehiclePositions.length : 0;

  if (rtPositionsPaused) {
    return;
  }

  const statusEl = document.querySelector('#rt_positions_status');
  if (statusEl && previousVehicleCount !== currentVehicleCount) {
    if (currentVehicleCount === 0) {
      statusEl.classList.remove('border-aux-green');
      statusEl.textContent = 'No active buses';
    } else {
      const directions = new Set();
      for (const vp of vehiclePositions) {
        const tripEl = document.querySelector('.timetable #trip_id_' + vp.vehicle.trip.trip_id);
        const dirName = tripEl ? tripEl.closest('.timetable').dataset.directionName : null;
        if (dirName) {
          directions.add(dirName);
        }
      }

      const showDirectionsInStatus = !filterVehiclesByDirection;
      const busText = `${currentVehicleCount} active ${currentVehicleCount === 1 ? 'bus' : 'buses'}`;
      if (directions.size > 0 && showDirectionsInStatus) {
        const dirList = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format([
          ...directions,
        ]);
        statusEl.classList.add('border-aux-green');
        statusEl.textContent = `${busText} – ${dirList}`;
      } else {
        statusEl.classList.add('border-aux-green');
        statusEl.textContent = busText;
      }
    }
    previousVehicleCount = currentVehicleCount;
  }

  const container = document.querySelector('#rt_positions_list');
  if (!container) {
    return;
  }

  container.innerHTML = '';

  if (!vehiclePositions || vehiclePositions.length === 0) {
    container.innerHTML = '<p class="p-4 text-gray-700">No active vehicles at this time.</p>';
    return;
  }

  let listHtml = `<ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 list-none m-0">`;

  for (const vehiclePosition of vehiclePositions) {
    const vehicleId = vehiclePosition.vehicle.vehicle.id;

    let vehicleTripUpdate = tripUpdates?.find(
      (tripUpdate) => tripUpdate.trip_update.trip.trip_id === vehiclePosition.vehicle.trip.trip_id,
    );

    if (!vehicleTripUpdate) {
      vehicleTripUpdate = tripUpdates?.find(
        (tripUpdate) => tripUpdate.trip_update.vehicle?.id === vehicleId,
      );
    }

    const lastUpdated = new Date(vehiclePosition.vehicle.timestamp * 1000);
    const tripEl = document.querySelector(
      '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
    );
    const directionName = tripEl ? tripEl.closest('.timetable').dataset.directionName : null;

    listHtml += `<li class="border rounded p-4 bg-white shadow-sm">`;

    if (directionName) {
      listHtml += `<h3 class="font-bold text-lg mb-2 mt-0">Vehicle: ${directionName}</h3>`;
    } else {
      listHtml += `<h3 class="font-bold text-lg mb-2 mt-0">Vehicle ${vehicleId}</h3>`;
    }

    const movingText = formatMovingText(vehiclePosition);
    if (movingText) {
      listHtml += `<p class="text-sm text-gray-600 mb-2 my-0">${movingText}</p>`;
    }

    const numberOfArrivalsToShow = 5;
    const nextArrivals = [];
    const referenceTime = dataFetchTimestamp || Date.now() / 1000;
    if (vehicleTripUpdate && vehicleTripUpdate.trip_update.stop_time_update) {
      for (const stoptimeUpdate of vehicleTripUpdate.trip_update.stop_time_update) {
        if (stoptimeUpdate.arrival) {
          const secondsToArrival = stoptimeUpdate.arrival.time - referenceTime;
          const stopName = stopData[stoptimeUpdate.stop_id]?.stop_name;

          if (secondsToArrival > 0 && stopName) {
            nextArrivals.push({
              delay: stoptimeUpdate.arrival.delay,
              secondsToArrival,
              stopName,
            });
          }

          if (nextArrivals.length >= numberOfArrivalsToShow) {
            break;
          }
        }
      }
    }

    if (nextArrivals.length > 0) {
      listHtml += `<h4 class="font-semibold text-sm mb-1 mt-2">Upcoming Stops:</h4>`;
      listHtml += `<ul class="list-none pl-0 text-sm m-0">`;

      nextArrivals.forEach((arrival) => {
        let delayText = '';
        if (arrival.delay > 0) {
          delayText = ` (${formatSeconds(arrival.delay)} behind)`;
        } else if (arrival.delay < 0) {
          delayText = ` (${formatSeconds(Math.abs(arrival.delay))} ahead)`;
        }

        listHtml += `<li class="py-1 border-b border-gray-100 last:border-b-0"><span class="font-medium">${formatSeconds(arrival.secondsToArrival)}</span> - ${arrival.stopName}${delayText}</li>`;
      });

      listHtml += `</ul>`;
    }

    listHtml += `<p class="text-xs text-gray-700 mt-2 mb-0">Updated: ${lastUpdated.toLocaleTimeString()}</p>`;
    listHtml += `</li>`;
  }

  listHtml += `</ul>`;
  container.innerHTML = listHtml;
}

function initRtPositionsPauseButton() {
  const pauseBtn = document.querySelector('#rt_positions_pause');
  if (!pauseBtn) return;

  pauseBtn.addEventListener('click', function () {
    rtPositionsPaused = !rtPositionsPaused;

    const icon = pauseBtn.querySelector('i');
    const text = pauseBtn.querySelector('span');
    const statusEl = document.querySelector('#rt_positions_status');

    if (rtPositionsPaused) {
      pauseBtn.setAttribute('aria-pressed', 'true');
      icon.classList.remove('bi-pause-fill');
      icon.classList.add('bi-play-fill');
      text.textContent = 'Resume Updates';
      statusEl.classList.remove('border-aux-green');
      statusEl.textContent = 'Updates paused';
    } else {
      pauseBtn.setAttribute('aria-pressed', 'false');
      icon.classList.remove('bi-play-fill');
      icon.classList.add('bi-pause-fill');
      text.textContent = 'Pause Updates';
      previousVehicleCount = null;
      if (vehiclePositions && tripUpdates) {
        if (filterVehiclesByDirection) {
          const visibleMapContainer = document.querySelector(
            '.coa-timetable-map-container:not([style*="display: none"])',
          );
          const directionId = visibleMapContainer
            ? String(visibleMapContainer.dataset.directionId)
            : null;
          if (directionId !== null) {
            const filteredPositions = vehiclePositions.filter(
              (vp) =>
                vp.vehicle.trip.direction_id !== undefined &&
                String(vp.vehicle.trip.direction_id) === directionId,
            );
            updateRtPositionsContainer(filteredPositions, tripUpdates);
          } else {
            updateRtPositionsContainer(vehiclePositions, tripUpdates);
          }
        } else {
          updateRtPositionsContainer(vehiclePositions, tripUpdates);
        }
      }
    }
  });
}

function getVehicleBearing(vehiclePosition, vehicleTripUpdate) {
  // If vehicle position includes bearing, use that
  if (
    vehiclePosition.vehicle.position.bearing !== undefined &&
    vehiclePosition.vehicle.position.bearing !== 0
  ) {
    return vehiclePosition.vehicle.position.bearing;
  }

  // Else try to calculate bearing from next stop
  if (vehicleTripUpdate && vehicleTripUpdate?.trip_update?.stop_time_update?.length > 0) {
    const nextStopTimeUpdate = vehicleTripUpdate.trip_update.stop_time_update[0];
    const nextStop = stopData[nextStopTimeUpdate.stop_id];

    if (nextStop && nextStop.stop_lat && nextStop.stop_lon) {
      const vehicleLocation = vehiclePosition.vehicle.position;
      const lat1 = vehicleLocation.latitude;
      const lon1 = vehicleLocation.longitude;
      const lat2 = nextStop.stop_lat;
      const lon2 = nextStop.stop_lon;

      const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
      let bearing = (Math.atan2(y, x) * 180) / Math.PI;
      bearing = (bearing + 360) % 360;

      return bearing;
    }
  }

  return null;
}

function getVehicleDirectionArrow(vehiclePosition, vehicleTripUpdate) {
  const bearing = getVehicleBearing(vehiclePosition, vehicleTripUpdate);

  if (bearing !== null) {
    return `<div class="vehicle-marker-arrow" aria-hidden="true" style="transform:rotate(${bearing}deg)"></div>`;
  } else {
    return `<div class="vehicle-marker-arrow no-bearing" aria-hidden="true"></div>`;
  }
}

function attachVehicleMarkerClickHandler(vehiclePosition, vehicleTripUpdate, map) {
  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  const vehicleMarker = vehicleMarkers[vehiclePosition.vehicle.vehicle.id];

  vehicleMarker
    .getElement()
    .removeEventListener('click', vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id]);

  vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id] = (event) => {
    event.stopPropagation();

    // Close stop popup if open (stop remains highlighted)
    closeStopPopup();

    if (vehiclePopup.isOpen()) {
      vehiclePopup.remove();
    }

    vehiclePopup
      .setLngLat(coordinates)
      .setHTML(getVehiclePopupHtml(vehiclePosition, vehicleTripUpdate))
      .addTo(map);
  };

  vehicleMarker
    .getElement()
    .addEventListener('click', vehicleMarkersEventListeners[vehiclePosition.vehicle.vehicle.id]);
}

function addVehicleMarker(vehiclePosition, vehicleTripUpdate) {
  if (!vehiclePosition.vehicle || !vehiclePosition.vehicle.position) {
    return;
  }

  const visibleTimetableId = document.querySelector('.timetable:not([style*="display: none"])')
    ?.dataset?.timetableId;

  const vehicleDirectionArrow = getVehicleDirectionArrow(vehiclePosition, vehicleTripUpdate);

  // Create a DOM element for each marker
  const el = document.createElement('div');
  el.className = 'vehicle-marker';
  el.style.width = '25px';
  el.style.height = '25px';
  el.setAttribute('role', 'img');

  const tripEl = document.querySelector(
    '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
  );
  const directionName = tripEl ? tripEl.closest('.timetable').dataset.directionName : null;
  const movingText = formatMovingText(vehiclePosition);
  const labelParts = ['Bus'];
  if (directionName) labelParts.push(directionName);
  if (movingText) labelParts.push(movingText.toLowerCase());
  el.setAttribute('aria-label', labelParts.join(' — '));

  if (vehicleDirectionArrow) {
    el.innerHTML = vehicleDirectionArrow;
  }

  const coordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  // Add marker to map
  const vehicleMarker = new maplibregl.Marker({
    element: el,
    anchor: 'center',
  })
    .setLngLat(coordinates)
    .addTo(maps[visibleTimetableId]);

  vehicleMarkers[vehiclePosition.vehicle.vehicle.id] = vehicleMarker;
}

function animateVehicleMarker(vehicleMarker, vehiclePosition) {
  const newCoordinates = [
    vehiclePosition.vehicle.position.longitude,
    vehiclePosition.vehicle.position.latitude,
  ];

  let startTime;
  const duration = 5000;
  const previousCoordinates = vehicleMarker.getLngLat().toArray();
  const longitudeDifference = newCoordinates[0] - previousCoordinates[0];
  const latitudeDifference = newCoordinates[1] - previousCoordinates[1];

  const animation = (timestamp) => {
    startTime = startTime || timestamp;
    const elapsedTime = timestamp - startTime;
    const progress = elapsedTime / duration;
    const safeProgress = Math.min(progress.toFixed(2), 1);
    const newLongitude = previousCoordinates[0] + safeProgress * longitudeDifference;
    const newLatitude = previousCoordinates[1] + safeProgress * latitudeDifference;

    vehicleMarker.setLngLat([newLongitude, newLatitude]);

    // Check if vehiclePopup element exists and is for this vehicle
    const popupElement = vehiclePopup.getElement();
    const vehiclePopupContentId = `vehicle-popup-${vehiclePosition.vehicle.vehicle.id}`;
    const markerPopupIsOpenForThisVehicle =
      popupElement && popupElement.querySelector(`#${vehiclePopupContentId}`);

    // Check if the open vehicle popup is for this vehicle
    if (vehiclePopup.isOpen() && markerPopupIsOpenForThisVehicle) {
      // Animate the popup along with the vehicle marker
      vehiclePopup.setLngLat([newLongitude, newLatitude]);
    }

    if (safeProgress != 1) {
      requestAnimationFrame(animation);
    }
  };

  requestAnimationFrame(animation);
}

function updateVehicleMarkerLocation(vehicleMarker, vehiclePosition, vehicleTripUpdate) {
  const vehicleDirectionArrow = getVehicleDirectionArrow(vehiclePosition, vehicleTripUpdate);

  if (vehicleDirectionArrow) {
    vehicleMarker.getElement().innerHTML = vehicleDirectionArrow;
  } else {
    vehicleMarker.getElement().innerHTML = '';
  }

  // Update aria-label with current movement info
  const tripEl = document.querySelector(
    '.timetable #trip_id_' + vehiclePosition.vehicle.trip.trip_id,
  );
  const directionName = tripEl ? tripEl.closest('.timetable').dataset.directionName : null;
  const movingText = formatMovingText(vehiclePosition);
  const labelParts = ['Bus'];
  if (directionName) labelParts.push(directionName);
  if (movingText) labelParts.push(movingText.toLowerCase());
  vehicleMarker.getElement().setAttribute('aria-label', labelParts.join(' — '));

  animateVehicleMarker(vehicleMarker, vehiclePosition);
}

async function fetchGtfsRealtime(url, headers) {
  if (!url) {
    return null;
  }

  const response = await fetch(url, {
    headers: { ...(headers ?? {}) },
  });

  if (!response.ok) {
    throw new Error(response.status);
  }

  const bufferRes = await response.arrayBuffer();
  const pdf = new Pbf(new Uint8Array(bufferRes));
  const obj = FeedMessage.read(pdf);
  return obj.entity;
}

async function updateArrivals({ withMap = true } = {}) {
  const realtimeVehiclePositions = gtfsRealtimeUrls?.realtimeVehiclePositions;
  const realtimeTripUpdates = gtfsRealtimeUrls?.realtimeTripUpdates;

  if (!realtimeVehiclePositions) {
    return;
  }

  try {
    const [latestVehiclePositions, latestTripUpdates] = await Promise.all([
      fetchGtfsRealtime(realtimeVehiclePositions?.url, realtimeVehiclePositions?.headers),
      fetchGtfsRealtime(realtimeTripUpdates?.url, realtimeTripUpdates?.headers),
    ]);

    // Store fetch timestamp for consistent arrival time calculations
    dataFetchTimestamp = Date.now() / 1000;

    if (!latestVehiclePositions?.length) {
      document
        .querySelectorAll('.vehicle-legend-item')
        .forEach((el) => (el.style.display = 'none'));
      return;
    }

    document.querySelectorAll('.vehicle-legend-item').forEach((el) => (el.style.display = ''));

    vehiclePositions = latestVehiclePositions.filter((vehiclePosition) => {
      if (
        !vehiclePosition ||
        !vehiclePosition.vehicle ||
        !vehiclePosition.vehicle.trip ||
        !vehiclePosition.vehicle.trip.trip_id
      ) {
        return false;
      }

      // Hide vehicles which show up 15 minutes or more before their trip start times
      if (
        secondsInFuture(
          `${vehiclePosition.vehicle.trip.start_date} ${vehiclePosition.vehicle.trip.start_time}`,
        ) >
        15 * 60
      ) {
        return false;
      }

      // If vehiclePosition includes route_id, use that to filter
      if (vehiclePosition.vehicle.trip.route_id) {
        return routeIds.includes(vehiclePosition.vehicle.trip.route_id);
      }

      // Otherwise, fall back to using trip_id to filter
      return tripIds.includes(vehiclePosition.vehicle.trip.trip_id);
    });

    tripUpdates = latestTripUpdates.filter((tripUpdate) => {
      if (!tripUpdate || !tripUpdate.trip_update || !tripUpdate.trip_update.trip) {
        return false;
      }

      return tripIds.includes(tripUpdate.trip_update.trip.trip_id);
    });

    if (withMap) {
      // Get the direction_id from the visible map container for filtering
      const visibleMapContainer = document.querySelector(
        '.coa-timetable-map-container:not([style*="display: none"])',
      );
      const mapDirectionId = visibleMapContainer
        ? String(visibleMapContainer.dataset.directionId)
        : null;

      const visibleTimetableId = document.querySelector(
        '.timetable:not([style*="display: none"])',
      )?.dataset?.timetableId;

      for (const vehiclePosition of vehiclePositions) {
        const vehicleId = vehiclePosition.vehicle.vehicle.id;

        // Get direction_id from the vehicle's trip
        const vehicleDirectionId =
          vehiclePosition.vehicle.trip.direction_id !== undefined
            ? String(vehiclePosition.vehicle.trip.direction_id)
            : null;

        // If filtering is enabled, skip vehicles that don't match the map's direction
        const shouldShowVehicle =
          !filterVehiclesByDirection ||
          mapDirectionId === null ||
          vehicleDirectionId === mapDirectionId;

        let vehicleTripUpdate = tripUpdates?.find(
          (tripUpdate) =>
            tripUpdate.trip_update.trip.trip_id === vehiclePosition.vehicle.trip.trip_id,
        );

        if (!vehicleTripUpdate) {
          vehicleTripUpdate = tripUpdates?.find(
            (tripUpdate) => tripUpdate.trip_update.vehicle.id === vehicleId,
          );
        }

        let vehicleMarker = vehicleMarkers[vehicleId];

        // If vehicle should not be shown, remove it if it exists and skip
        if (!shouldShowVehicle) {
          if (vehicleMarker) {
            vehicleMarker.remove();
            delete vehicleMarkers[vehicleId];
          }
          continue;
        }

        if (vehicleMarker === undefined) {
          // If not on map, add it
          addVehicleMarker(vehiclePosition, vehicleTripUpdate);
        } else {
          // Otherwise update location
          updateVehicleMarkerLocation(vehicleMarker, vehiclePosition, vehicleTripUpdate);
        }

        attachVehicleMarkerClickHandler(
          vehiclePosition,
          vehicleTripUpdate,
          maps[visibleTimetableId],
        );
      }

      // Remove vehicles not in the feed
      for (const vehicleId of Object.keys(vehicleMarkers)) {
        if (
          !vehiclePositions.find(
            (vehiclePosition) => vehiclePosition.vehicle.vehicle.id === vehicleId,
          )
        ) {
          vehicleMarkers[vehicleId].remove();
          delete vehicleMarkers[vehicleId];
        }
      }
    }

    // Update the text-based vehicle positions container, applying direction filter
    if (filterVehiclesByDirection) {
      const visibleMapContainer = document.querySelector(
        '.coa-timetable-map-container:not([style*="display: none"])',
      );
      const directionId = visibleMapContainer
        ? String(visibleMapContainer.dataset.directionId)
        : null;

      if (directionId !== null) {
        const filteredPositions = vehiclePositions.filter(
          (vp) =>
            vp.vehicle.trip.direction_id !== undefined &&
            String(vp.vehicle.trip.direction_id) === directionId,
        );
        updateRtPositionsContainer(filteredPositions, tripUpdates);
      } else {
        updateRtPositionsContainer(vehiclePositions, tripUpdates);
      }
    } else {
      updateRtPositionsContainer(vehiclePositions, tripUpdates);
    }

    // Notify other modules that tripUpdates data is available
    document.dispatchEvent(new CustomEvent('tripUpdatesReady'));
  } catch (error) {
    console.error(error);
  }
}

function toggleMap(id) {
  if (maps[id]) {
    // Resize the map to fit the visible area
    maps[id].resize();

    const geojson = geojsons[id];
    const bounds = getBounds(geojson);
    fitMapToBounds(maps[id], bounds);

    // Get the direction_id for the new visible map container
    const visibleMapContainer = document.querySelector(
      '.coa-timetable-map-container:not([style*="display: none"])',
    );
    const mapDirectionId = visibleMapContainer
      ? String(visibleMapContainer.dataset.directionId)
      : null;

    // Update the RT positions heading with the current direction name
    if (filterVehiclesByDirection) {
      const visibleTimetable = document.querySelector('.timetable:not([style*="display: none"])');
      const directionNameForHeading = visibleTimetable
        ? visibleTimetable.dataset.directionName
        : null;
      const headingEl = document.querySelector('#rt_positions_heading');
      if (headingEl && headingEl.dataset.baseLabel) {
        const baseLabel = headingEl.dataset.baseLabel;
        headingEl.textContent = directionNameForHeading
          ? `${baseLabel} (${directionNameForHeading})`
          : baseLabel;
      }
    }

    // Update vehicle markers to use the current visible map, applying direction filter
    for (const [vehicleId, vehicleMarker] of Object.entries(vehicleMarkers)) {
      const vehiclePosition = vehiclePositions?.find(
        (vehiclePosition) => vehiclePosition.vehicle.vehicle.id === vehicleId,
      );

      if (!vehiclePosition) {
        // Vehicle no longer in feed, remove it
        vehicleMarker.remove();
        delete vehicleMarkers[vehicleId];
        continue;
      }

      // Check if vehicle matches the current map's direction
      const vehicleDirectionId =
        vehiclePosition.vehicle.trip.direction_id !== undefined
          ? String(vehiclePosition.vehicle.trip.direction_id)
          : null;

      const shouldShowVehicle =
        !filterVehiclesByDirection ||
        mapDirectionId === null ||
        vehicleDirectionId === mapDirectionId;

      if (!shouldShowVehicle) {
        // Remove marker if it doesn't match the direction
        vehicleMarker.remove();
        delete vehicleMarkers[vehicleId];
        continue;
      }

      const vehicleTripUpdate = tripUpdates?.find((tripUpdate) => {
        return tripUpdate?.trip_update?.vehicle?.id === vehicleId;
      });

      attachVehicleMarkerClickHandler(vehiclePosition, vehicleTripUpdate, maps[id]);

      // Move marker to the current visible map
      vehicleMarker.addTo(maps[id]);
    }

    // Add any vehicles that match the new direction but weren't previously shown
    if (filterVehiclesByDirection && vehiclePositions) {
      for (const vehiclePosition of vehiclePositions) {
        const vehicleId = vehiclePosition.vehicle.vehicle.id;

        // Skip if marker already exists
        if (vehicleMarkers[vehicleId]) {
          continue;
        }

        const vehicleDirectionId =
          vehiclePosition.vehicle.trip.direction_id !== undefined
            ? String(vehiclePosition.vehicle.trip.direction_id)
            : null;

        const shouldShowVehicle = mapDirectionId === null || vehicleDirectionId === mapDirectionId;

        if (shouldShowVehicle) {
          let vehicleTripUpdate = tripUpdates?.find(
            (tripUpdate) =>
              tripUpdate.trip_update.trip.trip_id === vehiclePosition.vehicle.trip.trip_id,
          );

          if (!vehicleTripUpdate) {
            vehicleTripUpdate = tripUpdates?.find(
              (tripUpdate) => tripUpdate.trip_update.vehicle?.id === vehicleId,
            );
          }

          addVehicleMarker(vehiclePosition, vehicleTripUpdate);
          attachVehicleMarkerClickHandler(vehiclePosition, vehicleTripUpdate, maps[id]);
        }
      }
    }

    // Update the text-based container to match the new direction
    if (vehiclePositions && tripUpdates) {
      if (filterVehiclesByDirection && mapDirectionId !== null) {
        const filteredPositions = vehiclePositions.filter(
          (vp) =>
            vp.vehicle.trip.direction_id !== undefined &&
            String(vp.vehicle.trip.direction_id) === mapDirectionId,
        );
        updateRtPositionsContainer(filteredPositions, tripUpdates);
      } else {
        updateRtPositionsContainer(vehiclePositions, tripUpdates);
      }
    }
  }
}

async function createMap(id) {
  const defaultRouteColor = '#000000';
  const lineLayout = {
    'line-join': 'round',
    'line-cap': 'round',
  };

  const geojson = geojsons[id];

  if (!geojson || geojson.features.length === 0) {
    const mapEl = document.querySelector(`#map_timetable_id_${id}`);
    if (mapEl) mapEl.style.display = 'none';
    return false;
  }

  const bounds = getBounds(geojson);

  const mapStyle = await loadMapStyleWithWorkingFonts(mapStyleUrl);
  const map = new maplibregl.Map({
    container: `map_timetable_id_${id}`,
    style: mapStyle,
    center: bounds.getCenter(),
    zoom: 12,
    preserveDrawingBuffer: true,
    cooperativeGestures: true,
  });

  map.initialize = () => fitMapToBounds(map, bounds);

  // cooperativeGestures handles scroll/touch behavior - no need to disable scrollZoom
  map.addControl(new maplibregl.NavigationControl());
  map.addControl(new maplibregl.FullscreenControl());

  await new Promise((resolve) => {
    map.on('load', () => {
      // Set accessibility attributes on canvas
      const canvas = map.getCanvas();
      canvas.setAttribute('role', 'img');
      // Get route info from timetable element for descriptive label
      const timetableEl = document.querySelector('.timetable');
      const routeId = timetableEl ? timetableEl.dataset.routeId : null;
      const firstRouteId = routeId ? String(routeId).split('_')[0] : null;
      const route =
        firstRouteId && typeof routeData !== 'undefined' ? routeData[firstRouteId] : null;
      const routeLabel = route
        ? `Route ${route.route_short_name}${route.route_long_name ? ' - ' + route.route_long_name : ''}`
        : 'Bus route';
      canvas.setAttribute(
        'aria-label',
        `Interactive map showing ${routeLabel} with stops and real-time vehicle locations`,
      );

      fitMapToBounds(map, bounds);
      disablePointsOfInterest(map);
      addMapLayers(map, geojson, defaultRouteColor, lineLayout);
      setupEventListeners(map, id);

      // Collapse the attribution control by default
      const attribDetails = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
      if (attribDetails && attribDetails.tagName === 'DETAILS') {
        attribDetails.removeAttribute('open');
        attribDetails.classList.remove('maplibregl-compact-show');
      }

      resolve();
    });
  });

  return map;
}

function fitMapToBounds(map, bounds) {
  map.fitBounds(bounds, {
    padding: { top: 40, bottom: 40, left: 20, right: 40 },
    duration: 0,
  });
}

function disablePointsOfInterest(map) {
  const layers = map.getStyle().layers;
  const poiLayerIds = layers
    .filter((layer) => layer.id.startsWith('poi'))
    ?.map((layer) => layer.id);
  poiLayerIds.forEach((layerId) => {
    map.setLayoutProperty(layerId, 'visibility', 'none');
  });
}

function addMapLayers(map, geojson, defaultRouteColor, lineLayout) {
  const layers = map.getStyle().layers;
  const firstLabelLayerId = layers.find(
    (layer) => layer.type === 'symbol' && layer.id.includes('label'),
  )?.id;

  addRouteLineShadow(map, geojson, lineLayout, firstLabelLayerId);
  addRouteLineOutline(map, geojson, lineLayout, firstLabelLayerId);
  addRouteLine(map, geojson, defaultRouteColor, lineLayout, firstLabelLayerId);
  addStops(map, geojson);
  addHighlightedStops(map, geojson);
}

function addRouteLineShadow(map, geojson, lineLayout, firstSymbolId) {
  map.addLayer(
    {
      id: 'route-line-shadow',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': '#000000',
        'line-opacity': 0.3,
        'line-width': {
          base: 12,
          stops: [
            [14, 20],
            [18, 42],
          ],
        },
        'line-blur': {
          base: 12,
          stops: [
            [14, 20],
            [18, 42],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addRouteLineOutline(map, geojson, lineLayout, firstSymbolId) {
  map.addLayer(
    {
      id: 'route-line-outline',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': '#FFFFFF',
        'line-opacity': 1,
        'line-width': {
          base: 8,
          stops: [
            [14, 12],
            [18, 32],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addRouteLine(map, geojson, defaultRouteColor, lineLayout, firstSymbolId) {
  map.addLayer(
    {
      id: 'route-line',
      type: 'line',
      source: { type: 'geojson', data: geojson },
      paint: {
        'line-color': ['to-color', ['get', 'route_color'], defaultRouteColor],
        'line-opacity': 1,
        'line-width': {
          base: 4,
          stops: [
            [14, 6],
            [18, 16],
          ],
        },
      },
      layout: lineLayout,
      filter: ['!has', 'stop_id'],
    },
    firstSymbolId,
  );
}

function addStops(map, geojson) {
  map.addLayer({
    id: 'stops',
    type: 'circle',
    source: { type: 'geojson', data: geojson },
    paint: {
      'circle-color': '#ffffff',
      'circle-radius': {
        base: 1.75,
        stops: [
          [12, 4],
          [22, 100],
        ],
      },
      'circle-stroke-color': '#3f4a5c',
      'circle-stroke-width': 2,
    },
    filter: ['has', 'stop_id'],
  });
}

function addHighlightedStops(map, geojson) {
  map.addLayer({
    id: 'stops-highlighted',
    type: 'circle',
    source: { type: 'geojson', data: geojson },
    paint: {
      'circle-color': '#EFFF77',
      'circle-radius': {
        base: 1.75,
        stops: [
          [12, 6],
          [22, 150],
        ],
      },
      'circle-stroke-width': 4,
      'circle-stroke-color': '#005daa',
    },
    filter: ['==', 'stop_id', ''],
  });
}

function setupEventListeners(map, id) {
  map.on('mousemove', (event) => handleMouseMove(event, map));
  map.on('click', (event) => handleClick(event, map, id));
  setupTableHoverListeners(id, map);
}

function handleMouseMove(event, map) {
  // Only change cursor on hover, don't highlight
  const features = map.queryRenderedFeatures(event.point, {
    layers: ['stops'],
  });
  if (features.length > 0) {
    map.getCanvas().style.cursor = 'pointer';
  } else {
    map.getCanvas().style.cursor = '';
  }
}

function handleClick(event, map, id) {
  const bbox = [
    [event.point.x - 5, event.point.y - 5],
    [event.point.x + 5, event.point.y + 5],
  ];
  const features = map.queryRenderedFeatures(bbox, {
    layers: ['stops-highlighted', 'stops'],
  });

  if (!features || features.length === 0) {
    // Clicked on empty area - clear highlights
    if (typeof clearStopSelection === 'function') {
      clearStopSelection(id);
    } else {
      unHighlightStop(map, id);
    }
    return;
  }

  const feature = features[0];
  const stopId = feature.properties.stop_id;

  // Check if this stop is already highlighted (toggle behavior)
  const currentFilter = map.getFilter('stops-highlighted');
  const isAlreadyHighlighted =
    currentFilter && currentFilter[0] === 'any' && JSON.stringify(currentFilter).includes(stopId);

  if (isAlreadyHighlighted) {
    if (stopPopup) {
      // Popup is open — toggle off (deselect)
      if (typeof clearStopSelection === 'function') {
        clearStopSelection(id);
      } else {
        unHighlightStop(map, id);
      }
    } else {
      // Highlighted but no popup — open the popup
      showStopPopup(map, feature);
    }
  } else {
    // Use unified selectStop function to highlight everything
    if (typeof selectStop === 'function') {
      selectStop(stopId, id, { fromMap: true });
    }
    showStopPopup(map, feature);
  }
}

function showStopPopup(map, feature) {
  // Close any existing stop popup first
  closeStopPopup();

  // Close vehicle popup if open
  if (vehiclePopup && vehiclePopup.isOpen()) {
    vehiclePopup.remove();
  }

  currentStopPopupFeature = feature;

  stopPopup = new maplibregl.Popup()
    .setLngLat(feature.geometry.coordinates)
    .setHTML(getStopPopupHtml(feature, stopData[feature.properties.stop_id]))
    .addTo(map);
}

function closeStopPopup() {
  if (stopPopup) {
    stopPopup.remove();
    stopPopup = null;
  }
  currentStopPopupFeature = null;
}

/**
 * Shows a stop popup by stop ID (for use from timetable-menu.js)
 * @param {string} stopId - The stop_id to show popup for
 * @param {string} timetableId - The timetable ID to get geojson data from
 */
function showStopPopupById(stopId, timetableId) {
  if (typeof maps === 'undefined' || !maps[timetableId]) {
    console.warn('Map not available for timetable:', timetableId);
    return;
  }

  if (typeof stopData === 'undefined' || !stopData[stopId]) {
    console.warn('Stop data not found for stop:', stopId);
    return;
  }

  const map = maps[timetableId];
  const stop = stopData[stopId];

  // Get route_ids from geojson if available
  let routeIds = [];
  if (typeof geojsons !== 'undefined' && geojsons[timetableId]) {
    const geojson = geojsons[timetableId];
    for (const feature of geojson.features) {
      if (
        feature.geometry.type.toLowerCase() === 'point' &&
        feature.properties.stop_id === stopId
      ) {
        routeIds = feature.properties.route_ids || '[]';
        break;
      }
    }
  }

  // Construct a feature-like object for showStopPopup
  const feature = {
    geometry: {
      coordinates: [stop.stop_lon, stop.stop_lat],
    },
    properties: {
      stop_id: stopId,
      route_ids: typeof routeIds === 'string' ? routeIds : JSON.stringify(routeIds),
    },
  };

  showStopPopup(map, feature);
}

function highlightStop(map, id, stopIds) {
  map.setFilter('stops-highlighted', [
    'any',
    ['in', 'stop_id', ...stopIds],
    ['in', 'parent_station', ...stopIds],
  ]);

  highlightTimetableStops(id, stopIds);
}

function unHighlightStop(map, id) {
  map.setFilter('stops-highlighted', ['==', 'stop_id', '']);
  unHighlightTimetableStops(id);
  closeStopPopup();
}

function highlightTimetableStops(id, stopIds) {
  const table = document.querySelector(`#timetable_id_${id} table`);
  if (!table) return;
  const isVertical = table.dataset.orientation === 'vertical';

  if (isVertical) {
    highlightVerticalTimetableStops(id, stopIds);
  } else {
    highlightHorizontalTimetableStops(id, stopIds);
  }
}

function highlightVerticalTimetableStops(id, stopIds) {
  const table = document.querySelector(`#timetable_id_${id} table`);
  if (!table) return;
  const columnIndexes = [];
  const stopIdSelectors = stopIds
    .map((stopId) => `#timetable_id_${id} table colgroup col[data-stop-id="${stopId}"]`)
    .join(',');

  document.querySelectorAll(stopIdSelectors).forEach((col) => {
    const allCols = table.querySelectorAll('colgroup col');
    columnIndexes.push(Array.from(allCols).indexOf(col));
  });

  table
    .querySelectorAll('.stop-time, thead .stop-header')
    .forEach((el) => el.classList.remove('highlighted'));
  table.querySelectorAll('.trip-row').forEach((row) => {
    row.querySelectorAll('.stop-time').forEach((el, index) => {
      if (columnIndexes.includes(index)) {
        el.classList.add('highlighted');
      }
    });
  });

  table.querySelectorAll('thead').forEach((thead) => {
    thead.querySelectorAll('.stop-header').forEach((el, index) => {
      if (columnIndexes.includes(index)) {
        el.classList.add('highlighted');
      }
    });
  });
}

function highlightHorizontalTimetableStops(id, stopIds) {
  const table = document.querySelector(`#timetable_id_${id} table`);
  if (!table) return;
  table.querySelectorAll('.stop-row').forEach((el) => el.classList.remove('highlighted'));
  const stopIdSelectors = stopIds
    .map((stopId) => `#timetable_id_${id} table #stop_id_${stopId}`)
    .join(',');
  document.querySelectorAll(stopIdSelectors).forEach((el) => el.classList.add('highlighted'));
}

function unHighlightTimetableStops(id) {
  const table = document.querySelector(`#timetable_id_${id} table`);
  if (!table) return;
  const isVertical = table.dataset.orientation === 'vertical';

  if (isVertical) {
    table
      .querySelectorAll('.stop-time, thead .stop-header')
      .forEach((el) => el.classList.remove('highlighted'));
  } else {
    table.querySelectorAll('.stop-row').forEach((el) => el.classList.remove('highlighted'));
  }
}

function setupTableHoverListeners(id, map) {
  const table = document.querySelector(`#timetable_id_${id} table`);
  if (!table) return;
  const stopHeaders = table.querySelectorAll(
    'th.stop-header:not(.continues-from):not(.continues-as)',
  );

  // Make stop headers keyboard accessible
  stopHeaders.forEach(function (header) {
    header.setAttribute('tabindex', '0');
    header.setAttribute('role', 'button');
    header.setAttribute('aria-pressed', 'false');
  });

  // Shared handler for both click and keyboard activation
  function handleStopCellActivation(event) {
    const actualCell = event.target.closest('td, th');
    if (!actualCell) return;
    const stopId = getStopIdFromTableCell(actualCell, table);

    if (stopId !== undefined) {
      const isAlreadyHighlighted = actualCell.classList.contains('highlighted');

      if (isAlreadyHighlighted) {
        if (typeof clearStopSelection === 'function') {
          clearStopSelection(id);
        } else {
          unHighlightTimetableStops(id);
          unHighlightStop(map, id);
        }
        stopHeaders.forEach((h) => h.setAttribute('aria-pressed', 'false'));
      } else {
        if (typeof selectStop === 'function') {
          selectStop(stopId.toString(), id, { fromTable: true, showPopup: false });
        } else {
          highlightStop(map, id, [stopId.toString()]);
          highlightTimetableStops(id, [stopId.toString()]);
        }
        stopHeaders.forEach((h) => h.setAttribute('aria-pressed', 'false'));
        actualCell.setAttribute('aria-pressed', 'true');
      }
    }
  }

  // Click handler for mouse users
  table.querySelectorAll('th.stop-header, td.stop-time').forEach((el) => {
    el.addEventListener('click', handleStopCellActivation);
  });

  // Keyboard handler for Enter/Space on stop headers
  stopHeaders.forEach((header) => {
    header.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleStopCellActivation(event);
      }
    });
  });
}

function getStopIdFromTableCell(cell, tableOverride) {
  const actualCell = cell.closest('td, th');
  if (!actualCell) return undefined;

  const table = tableOverride || actualCell.closest('table');
  if (table.dataset.orientation === 'vertical') {
    let index;
    if (actualCell.matches('th.stop-header')) {
      const headers = actualCell.parentElement.querySelectorAll(
        'th.stop-header:not(.continues-from):not(.continues-as)',
      );
      index = Array.from(headers).indexOf(actualCell);
    } else if (actualCell.matches('td.stop-time')) {
      const cells = actualCell.parentElement.querySelectorAll('td.stop-time');
      index = Array.from(cells).indexOf(actualCell);
    } else {
      return undefined;
    }
    const col = table.querySelectorAll('colgroup col')[index];
    return col ? col.dataset.stopId : undefined;
  } else {
    const row = actualCell.closest('tr');
    return row ? row.dataset.stopId : undefined;
  }
}

async function createMaps() {
  // Store the base heading text so we can append direction names later
  const headingEl = document.querySelector('#rt_positions_heading');
  if (headingEl && !headingEl.dataset.baseLabel) {
    headingEl.dataset.baseLabel = headingEl.textContent.trim();
  }

  for (const id of Object.keys(geojsons)) {
    maps[id] = await createMap(id);
  }

  // If a stop was already selected before maps loaded (e.g. from URL param), apply the map highlight now
  const initialStopId = new URLSearchParams(window.location.search).get('stop_id');
  if (initialStopId) {
    const visibleTimetable = document.querySelector('.timetable:not([style*="display: none"])');
    if (visibleTimetable) {
      const timetableId = visibleTimetable.dataset.timetableId;
      if (maps[timetableId]) {
        maps[timetableId].setFilter('stops-highlighted', [
          'any',
          ['in', 'stop_id', initialStopId],
          ['in', 'parent_station', initialStopId],
        ]);
      }
    }
  }

  // Set initial heading with current direction name
  if (filterVehiclesByDirection) {
    const visibleTimetable = document.querySelector('.timetable:not([style*="display: none"])');
    const initialDirectionName = visibleTimetable ? visibleTimetable.dataset.directionName : null;
    if (headingEl && headingEl.dataset.baseLabel && initialDirectionName) {
      headingEl.textContent = `${headingEl.dataset.baseLabel} (${initialDirectionName})`;
    }
  }

  // GTFS-Realtime Vehicle Positions
  if (!gtfsRealtimeInterval && gtfsRealtimeUrls?.realtimeVehiclePositions?.url) {
    // Popup for realtime vehicle locations
    const markerHeight = 20;
    const markerRadius = 10;
    const linearOffset = 15;
    vehiclePopup = new maplibregl.Popup({
      closeOnClick: true,
      className: 'vehicle-popup',
      offset: {
        top: [0, 0],
        'top-left': [0, 0],
        'top-right': [0, 0],
        bottom: [0, -markerHeight],
        'bottom-left': [linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
        'bottom-right': [-linearOffset, (markerHeight - markerRadius + linearOffset) * -1],
        left: [markerRadius, (markerHeight - markerRadius) * -1],
        right: [-markerRadius, (markerHeight - markerRadius) * -1],
      },
    });

    const arrivalUpdateInterval = 10 * 1000; // 10 seconds
    updateArrivals();
    gtfsRealtimeInterval = setInterval(() => {
      updateArrivals();
    }, arrivalUpdateInterval);
  }

  // Initialize pause button for RT positions container
  initRtPositionsPauseButton();

  // Refresh stop popup content when real-time data updates.
  // Update the DOM content directly instead of calling setHTML() to avoid
  // MapLibre's _update() repositioning, which can cause the page to scroll.
  document.addEventListener('tripUpdatesReady', () => {
    if (stopPopup && currentStopPopupFeature) {
      const stop = stopData[currentStopPopupFeature.properties.stop_id];
      if (stop) {
        const contentEl = stopPopup.getElement()?.querySelector('.maplibregl-popup-content');
        if (contentEl) {
          // Preserve the close button, update only the user content
          const closeButton = contentEl.querySelector('.maplibregl-popup-close-button');
          const newHtml = getStopPopupHtml(currentStopPopupFeature, stop);
          // Clear non-close-button children and insert new content
          Array.from(contentEl.childNodes).forEach((child) => {
            if (child !== closeButton) child.remove();
          });
          contentEl.insertAdjacentHTML('beforeend', newHtml);
        }
      }
    }
  });

  // Add document-level escape key handler to close popups
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      let closedPopup = false;

      // Close vehicle popup if open
      if (vehiclePopup && vehiclePopup.isOpen()) {
        vehiclePopup.remove();
        closedPopup = true;
      }

      // Close stop popup if open
      if (stopPopup) {
        closeStopPopup();
        closedPopup = true;
      }
    }
  });
}
