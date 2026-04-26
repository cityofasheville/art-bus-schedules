/* global document, jQuery, maplibregl, Pbf, mapStyleUrl, stopData, routeData, routeIds, tripIds, geojsons, gtfsRealtimeUrls */

let tripUpdates;

/**
 * Announces a status message to screen readers via the live region
 * @param {string} message - The message to announce
 */
function announceDepartureStatus(message) {
  const statusEl = jQuery('#departure_status');
  if (statusEl.length) {
    statusEl.text(message);
  }
}

function showSelectedInterface() {
  jQuery('#departure_interface_selector input[name="departure_interface"]').each(
    (index, element) => {
      jQuery(element).parents('label').toggleClass('btn-blue', jQuery(element).is(':checked'));
      jQuery(element)
        .parents('label')
        .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
    },
  );

  const selected_interface = jQuery(
    '#departure_interface_selector input[name="departure_interface"]:checked',
  ).val();

  jQuery('.departure-interface').hide();

  jQuery(`#container_${selected_interface}`).show();
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

async function updateArrivals() {
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
  } catch (error) {
    console.error(error);
  }
}

function augmentArrivalInfo(arrival, stop_id) {
  let augmentedArrival = { ...arrival };
  let today_day_of_week = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

  if (stopData[stop_id]) {
    augmentedArrival.stop_name = stopData[stop_id].stop_name;
  }

  if (tripData[arrival.trip_id]) {
    let thisRouteId = tripData[arrival.trip_id].route_id;
    if (routeData[thisRouteId]) {
      augmentedArrival.route_long_name = routeData[thisRouteId].route_long_name;
      augmentedArrival.route_short_name = routeData[thisRouteId].route_short_name;
      augmentedArrival.route_color = routeData[thisRouteId].route_color;
      augmentedArrival.route_text_color = routeData[thisRouteId].route_text_color;
      let direction_info = directions.filter((dir) => {
        return dir.route_id === thisRouteId && dir.direction_id === arrival.direction_id;
      });
      if (direction_info.length > 0) {
        augmentedArrival.direction_name = direction_info[0].direction;
        augmentedArrival.direction_id = direction_info[0].direction_id;
        let timetableId = 0;
        let matching_timetable = timetableData.filter((tt) => {
          return (
            tt.route_id === thisRouteId &&
            tt.direction_id === arrival.direction_id &&
            tt[today_day_of_week] === 1
          );
        });
        if (matching_timetable.length > 0) {
          augmentedArrival.timetable_id = matching_timetable[0].timetable_id;
          let default_timetable_day = 'Mon-Fri';
          if (matching_timetable[0].saturday === 1 && matching_timetable[0].sunday !== 1) {
            default_timetable_day = 'Sat';
          } else if (matching_timetable[0].saturday !== 1 && matching_timetable[0].sunday === 1) {
            default_timetable_day = 'Sun';
          }
          augmentedArrival.timetable_day = default_timetable_day;
        }
      }
    }
  }

  augmentedArrival.time_from_now = Math.round((arrival.time - Date.now() / 1000) / 60);

  return augmentedArrival;
}

function groupArrivalsByRouteAndDirection(arrivals) {
  const groups = {};
  arrivals.forEach((a) => {
    const groupKey = `${a.route_short_name || 'Unknown'} ${a.direction_name || ''}`.trim();
    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(a);
  });
  return groups;
}

function handleReloadArrivals(event) {
  const stop_id = event.currentTarget.getAttribute('data-stopid');
  if (!stop_id) {
    return;
  }
  setUrlParam('stop_id', stop_id);
  fetchRealtimeDeparturesForStop(stop_id);
}

function handleStopSelection(event) {
  const stop_id = event.target.value;
  if (!stop_id) {
    return;
  }
  setUrlParam('stop_id', stop_id);
  fetchRealtimeDeparturesForStop(stop_id);
}

function toggleFavoriteStop(stop_id) {
  let defaultStops = getFavoriteStops();
  stop_id = String(stop_id);

  if (defaultStops.includes(stop_id)) {
    defaultStops = defaultStops.filter((id) => id !== stop_id);
    // Use Tom Select API to remove the option
    if (typeof favoriteStopSelectInstance !== 'undefined' && favoriteStopSelectInstance) {
      favoriteStopSelectInstance.removeOption(stop_id);
      favoriteStopSelectInstance.refreshOptions(false);
    }
    if (defaultStops.length === 0) {
      jQuery('#favorite_stops_select_container').hide();
      jQuery('#favorite_instructions_container').show();
    }
  } else {
    defaultStops.push(stop_id);
    let this_stop = stopData[stop_id];
    let displayText = `${this_stop.stop_name} (${this_stop.stop_code})`;
    // Use Tom Select API to add the option
    if (typeof favoriteStopSelectInstance !== 'undefined' && favoriteStopSelectInstance) {
      favoriteStopSelectInstance.addOption({ value: stop_id, text: displayText });
      favoriteStopSelectInstance.refreshOptions(false);
    }
    jQuery('#favorite_instructions_container').hide();
    jQuery('#favorite_stops_select_container').show();
  }

  localStorage.setItem('art_favorite_stops', JSON.stringify(defaultStops));
  $(`#favorite_stop_icon_${stop_id}`).toggleClass('bi-star-fill bi-star');
}

function getFavoriteStops() {
  const stored_favorite_stops = localStorage.getItem('art_favorite_stops');
  if (!stored_favorite_stops) return [];
  try {
    const arr = JSON.parse(stored_favorite_stops);
    return Array.isArray(arr) ? arr : [String(arr)];
  } catch {
    return [String(stored_favorite_stops)];
  }
}

function setUrlParam(paramName, paramValue) {
  const url = new URL(window.location);
  url.searchParams.set(paramName, paramValue);
  window.history.replaceState({}, '', url);
}

function getUrlParam(paramName) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(paramName);
}

async function fetchRealtimeDeparturesForStop(stop_id) {
  // console.log('Fetching realtime departures for stop ID:', stop_id);
  const favorite_stops = getFavoriteStops();
  const thisStop = stopData[stop_id];
  $('#results-container').html('Loading upcoming arrivals...');

  if (!thisStop) {
    $('#results-container').html('<div class="no-arrivals">Invalid stop selected.</div>');
    return;
  }

  // TODO: prepare immutable stop, route, trip, etc datastructures and then derive smaller datastructures for the selected stop
  // this should make the lookups faster

  await updateArrivals({
    withMap: false,
  });

  const arrivals = getUpcomingArrivalsForStop(stop_id);

  const augmentedArrivals = arrivals.map((arrival) => augmentArrivalInfo(arrival, stop_id));
  const groupedArrivals = groupArrivalsByRouteAndDirection(augmentedArrivals);

  // Extract unique routes serving this stop from routeDirectionStops
  const uniqueRoutes = [];
  const seenRoutes = new Set();

  for (const key in routeDirectionStops) {
    const stops = routeDirectionStops[key] || [];
    // Check if this route/direction serves the current stop
    const servesStop = stops.some((stop) => stop.stop_id === stop_id);
    if (servesStop) {
      const [route_id, direction_id] = key.split('_');
      const routeInfo = routeData[route_id];

      if (routeInfo && !seenRoutes.has(routeInfo.route_short_name)) {
        seenRoutes.add(routeInfo.route_short_name);

        // Get direction name from directions array
        const directionInfo = directions.find(
          (dir) => dir.route_id === route_id && dir.direction_id === parseInt(direction_id),
        );

        uniqueRoutes.push({
          route_short_name: routeInfo.route_short_name,
          route_color: routeInfo.route_color,
          route_text_color: routeInfo.route_text_color,
          direction_name: directionInfo ? directionInfo.direction : '',
        });
      }
    }
  }

  const timeUpdated = new Date();
  const formattedTimeUpdated = timeUpdated.toLocaleTimeString([], {
    timeStyle: 'short',
  });

  // console.log('augmentedArrivals', augmentedArrivals);

  let html = '';
  if (augmentedArrivals.length === 0) {
    html = '<div class="no-arrivals">No upcoming arrivals for this stop.</div>';
  } else {
    html = ``;
    html += `<div class="w-full flex items-start justify-between gap-4">
    <div id="arrivals_header_container">
        <h3 class="text-base font-semibold arrivals-header my-0">Upcoming arrivals for ${
          thisStop.stop_name
        } (${thisStop.stop_code})</h3>
        <div class="flex gap-2 items-center text-sm text-gray-600">As of ${formattedTimeUpdated} <button class="p-2" data-stopid="${stop_id}" onClick="handleReloadArrivals(event)"><i class="bi bi-arrow-clockwise" aria-hidden="true"></i><span class="sr-only">Reload arrivals</span></button></div>
    </div>
    <div>
      <button class="p-2" data-stopid="${stop_id}" onClick="toggleFavoriteStop(${stop_id})"><i id="favorite_stop_icon_${stop_id}" class="bi ${
        favorite_stops.includes(stop_id) ? 'bi-star-fill' : 'bi-star'
      }" aria-hidden="true"></i><span class="sr-only">${
        favorite_stops.includes(stop_id) ? 'Clear default stop' : 'Make this my default stop'
      }</span>
      </button>
    </div>
    </div>`;
    html += `<table class="w-full arrivals-table my-4">`;
    html += `<thead><tr><th class="w-[80px] sm:w-[115px] text-center pr-1 sm:pr-3 text-sm sm:text-base">Route</th><th class="text-left px-2 sm:px-4 text-sm sm:text-base">Arrivals</th></tr></thead>`;
    html += `<tbody>`;
    for (const groupKey in groupedArrivals) {
      html += `<tr class="odd:bg-white even:bg-slate-100">`;
      html += `<td class="align-middle pl-1 sm:pl-2 pr-1 sm:pr-3 py-2">
        <div class="flex items-center justify-items-center px-0">
          <a href="/${groupedArrivals[groupKey][0].route_short_name}/?direction_id=${
            groupedArrivals[groupKey][0].direction_id
          }&day_list=${groupedArrivals[groupKey][0].timetable_day}&timetable_id=${
            groupedArrivals[groupKey][0].timetable_id
          }" class="mx-auto text-center">
          <span class="route-color-swatch-responsive" style="background-color: #${
            groupedArrivals[groupKey][0].route_color
          };color: #${groupedArrivals[groupKey][0].route_text_color};">${
            groupedArrivals[groupKey][0].route_short_name
          }</span>
          <span class="block direction text-gray-700 text-xs sm:text-sm">${
            groupedArrivals[groupKey][0].direction_name || ''
          }</span>
          </a>
        </div>
      </td>`;
      html += `<td class="align-middle py-2">
      <div class="flex items-center divide-x divide-slate-200 gap-2 sm:gap-4 px-0">`;

      let arrivalsProcessed = 0;
      for (const arrival of groupedArrivals[groupKey]) {
        const dateWithoutSecond = new Date(arrival.time * 1000);
        const formattedTime = dateWithoutSecond.toLocaleTimeString([], {
          timeStyle: 'short',
        });
        html += `
            <span class="w-16 sm:w-24 text-center ${
              arrivalsProcessed === 2 ? 'hidden xs:inline-block' : ''
            }
              ${arrivalsProcessed === 3 ? 'hidden md:inline-block' : ''}
              ${arrivalsProcessed > 3 ? 'hidden lg:inline-block' : ''}">
            <span class="text-lg sm:text-2xl text-gray-700">${arrival.time_from_now}</span> <span class="text-xs sm:text-base">min</span><br />
            <span class="text-[10px] sm:text-xs text-gray-500">
                        (${formattedTime})
            </span>
            </span>
        `;
        arrivalsProcessed += 1;
      }

      html += `</div></td>`;
      html += `</tr>`;
    }
    html += `<tbody>`;
    html += `</table>`;
    html += `</div>`;
  }

  $('#results-container').html(html);
}

function getUpcomingArrivalsForStop(stop_id) {
  const arrivals = [];
  if (!tripUpdates) return arrivals;

  for (const tripUpdate of tripUpdates) {
    const stopTimeUpdates = tripUpdate.trip_update.stop_time_update.filter(
      (stopTimeUpdate) =>
        stopTimeUpdate.stop_id === stop_id &&
        (stopTimeUpdate.departure !== null || stopTimeUpdate.arrival !== null) &&
        stopTimeUpdate.schedule_relationship !== 3,
    );

    for (const update of stopTimeUpdates) {
      const time = update.departure ? update.departure.time : update.arrival.time;
      const delay = update.departure ? update.departure.delay : update.arrival.delay;
      arrivals.push({
        trip_id: tripUpdate.trip_update.trip.trip_id,
        time,
        delay,
        direction_id: tripUpdate.trip_update.trip.direction_id,
      });
    }
  }

  arrivals.sort((a, b) => a.time - b.time);
  return arrivals;
}

jQuery(() => {
  jQuery(
    `#departure_interface_selector input[name="departure_interface"][value="search_stop"]`,
  ).prop('checked', true);

  showSelectedInterface();

  jQuery('#departure_interface_selector input[name="departure_interface"]').change(function () {
    showSelectedInterface();
    const selectedValue = jQuery(this).val();
    const labels = {
      search_stop: 'Search by stop',
      favorites: 'Favorite stops',
      choose_route: 'Search by route',
    };
    announceDepartureStatus('Showing ' + (labels[selectedValue] || selectedValue));
  });
  console.log('Route data and stop data loaded:', routeData, directions, routeDirectionStops);

  // Populate favorites dropdown - defer to allow Tom Select to initialize first
  setTimeout(function () {
    populateFavoriteStops();
  }, 0);
});

/**
 * Populates the favorite stops dropdown from localStorage
 * Uses Tom Select API if available, otherwise falls back to DOM manipulation
 */
function populateFavoriteStops() {
  const favorite_stops = getFavoriteStops();

  if (favorite_stops.length > 0) {
    favorite_stops.forEach((stop_id) => {
      let this_stop = stopData[stop_id];
      if (!this_stop) return; // Skip if stop data not found

      let displayText = `${this_stop.stop_name} (${this_stop.stop_code})`;

      // Use Tom Select API if available
      if (typeof favoriteStopSelectInstance !== 'undefined' && favoriteStopSelectInstance) {
        favoriteStopSelectInstance.addOption({ value: stop_id, text: displayText });
      } else {
        // Fallback to DOM manipulation
        let new_option_element = new Option(displayText, stop_id, false, false);
        $('#favorite-stop-select-dropdown').append(new_option_element);
      }
    });

    // Refresh Tom Select to show new options
    if (typeof favoriteStopSelectInstance !== 'undefined' && favoriteStopSelectInstance) {
      favoriteStopSelectInstance.refreshOptions(false);
    }

    jQuery('#favorite_instructions_container').hide();
    jQuery('#favorite_stops_select_container').show();
  } else {
    jQuery('#favorite_stops_select_container').hide();
    jQuery('#favorite_instructions_container').show();
  }
}
