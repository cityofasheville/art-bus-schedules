/* global TomSelect, createAccessibleTomSelect */
/* eslint no-unused-vars: "off" */

// Global object to store Tom Select instances by timetable ID
const stopSearchSelects = {};

/**
 * Escapes HTML special characters for safe insertion
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Returns the first visible .timetable element, or null
 */
function getVisibleTimetable() {
  return document.querySelector('.timetable:not([style*="display: none"])');
}

/**
 * Announces a status message to screen readers via the live region
 * @param {string} message - The message to announce
 */
function announceStatus(message) {
  const statusEl = document.querySelector('#timetable_status');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function showSelectedTimetable() {
  const timetables = document.querySelectorAll('.timetable');
  if (timetables.length === 1) {
    showTimetable(timetables[0].dataset.timetableId);
    return false;
  }

  document.querySelectorAll('#day_list_selector input[name="dayList"]').forEach((element) => {
    element.closest('label').classList.toggle('btn-blue', element.checked);
    element.closest('label').classList.toggle('btn-gray', !element.checked);
  });

  document
    .querySelectorAll('#direction_name_selector input[name="directionId"]')
    .forEach((element) => {
      element.closest('label').classList.toggle('btn-blue', element.checked);
      element.closest('label').classList.toggle('btn-gray', !element.checked);
    });

  document.querySelectorAll('#timepoint_selector input[name="timepoints"]').forEach((element) => {
    element.closest('label').classList.toggle('btn-blue', element.checked);
    element.closest('label').classList.toggle('btn-gray', !element.checked);
  });

  const dayList = document.querySelector('#day_list_selector input[name="dayList"]:checked').value;

  const directionId = document.querySelector(
    '#direction_name_selector input[name="directionId"]:checked',
  ).value;

  document.querySelectorAll('.timetable').forEach((el) => (el.style.display = 'none'));
  document
    .querySelectorAll('.coa-timetable-map-container')
    .forEach((el) => (el.style.display = 'none'));

  const matchingTimetable = document.querySelector(
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`,
  );
  const id = matchingTimetable ? matchingTimetable.dataset.timetableId : undefined;

  showTimetable(id);
}

function showTimetable(id) {
  const timetableEl = document.querySelector(`#timetable_id_${id}`);
  if (timetableEl) timetableEl.style.display = '';
  const mapEl = document.querySelector(`#coa_map_container_${id}`);
  if (mapEl) mapEl.style.display = '';
  toggleMap(id);
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

function hideNonTimepointColumns() {
  const timetables = document.querySelectorAll('.timetable');

  timetables.forEach((table) => {
    table.dataset.stops = 'timepoints-only';

    const colgroup = table.querySelector('colgroup');
    if (!colgroup) {
      console.warn('colgroup not found in a .timetable table.');
      return;
    }

    const colElements = colgroup.querySelectorAll('col');
    const columnsToHideIndices = [];

    colElements.forEach((col, index) => {
      if (col.getAttribute('data-is-timepoint') === 'false') {
        columnsToHideIndices.push(index);
      }
    });

    columnsToHideIndices.forEach((index) => {
      if (colElements[index]) {
        colElements[index].style.display = 'none';
      }
    });

    // Optionally, hide header and body cells for consistency
    const theadRow = table.querySelector('thead tr');
    const tbodyRows = table.querySelectorAll('tbody tr');

    if (theadRow) {
      const headerCells = theadRow.querySelectorAll('th');
      columnsToHideIndices.forEach((index) => {
        if (headerCells[index]) {
          headerCells[index].style.display = 'none';
        }
      });
    }

    tbodyRows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      columnsToHideIndices.forEach((index) => {
        if (cells[index]) {
          cells[index].style.display = 'none';
        }
      });
    });
  });
}

function showAllTimetableStops() {
  const timetables = document.querySelectorAll('.timetable');

  timetables.forEach((table) => {
    table.dataset.stops = 'all-stops';

    const colgroup = table.querySelector('colgroup');
    if (!colgroup) return;

    const colElements = colgroup.querySelectorAll('col');
    const theadRow = table.querySelector('thead tr');
    const tbodyRows = table.querySelectorAll('tbody tr');

    colElements.forEach((col, index) => {
      col.style.display = ''; // Ensure <col> is visible

      // Handle header cells
      if (theadRow) {
        const headerCells = theadRow.querySelectorAll('th');
        if (headerCells[index]) {
          headerCells[index].style.display = '';
        }
      }

      // Handle body cells
      tbodyRows.forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells[index]) {
          cells[index].style.display = '';
        }
      });
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  const initialDirection = getUrlParam('direction_id');
  const initialDayList = getUrlParam('day_list');
  const initialTimepoints = getUrlParam('timepoints');
  const initialStopId = getUrlParam('stop_id');

  const today = new Date();
  const today_day_of_week = today.getDay();
  const todayStr =
    today.getFullYear().toString() +
    (today.getMonth() + 1).toString().padStart(2, '0') +
    today.getDate().toString().padStart(2, '0');

  let default_timetable_day;
  let default_direction_id = 0;

  // For testing purposes, you can uncomment the line below to simulate a holiday
  // window.holidayDates.push(todayStr);

  const isHoliday =
    typeof window.holidayDates !== 'undefined' && window.holidayDates.includes(todayStr);

  if (isHoliday || today_day_of_week === 0) {
    default_timetable_day = 'Sun';
  } else if (today_day_of_week === 6) {
    default_timetable_day = 'Sat';
  } else {
    default_timetable_day = 'Mon-Fri';
  }

  if (isHoliday) {
    const holidayNoteEl = document.getElementById('holiday_note');
    if (holidayNoteEl) {
      holidayNoteEl.className =
        'p-4 mb-6 border-l-4 border-yellow-500 bg-yellow-50 rounded text-art-black';
      holidayNoteEl.innerHTML =
        '<div class="flex items-center gap-2"><i class="bi bi-exclamation-triangle-fill text-yellow-600" aria-hidden="true"></i><strong>Holiday Schedule in Effect Today</strong></div>' +
        '<p class="mt-1 mb-0 text-sm">Today is an ART system holiday. Buses are operating on a Sunday/Holiday schedule.</p>';
    }
  }

  const this_route_direction_ids = [
    ...new Set(
      Array.from(document.querySelectorAll('input[name="directionId"]')).map((el) => el.value),
    ),
  ];

  if (this_route_direction_ids.length > 0) {
    default_direction_id = this_route_direction_ids[0];
  }

  if (initialDirection) {
    const dirEl = document.querySelector(
      'input[name="directionId"][value="' + initialDirection + '"]',
    );
    if (dirEl) dirEl.checked = true;
  } else {
    const dirEl = document.querySelector(
      'input[name="directionId"][value="' + default_direction_id + '"]',
    );
    if (dirEl) dirEl.checked = true;
  }

  if (initialDayList) {
    const dayEl = document.querySelector('input[name="dayList"][value="' + initialDayList + '"]');
    if (dayEl) dayEl.checked = true;
  } else {
    const dayEl = document.querySelector(`input[name="dayList"][value="${default_timetable_day}"]`);
    if (dayEl) dayEl.checked = true;
  }

  if (
    initialTimepoints &&
    (initialTimepoints === 'timepoints_only' || initialTimepoints === 'all_stops')
  ) {
    const tpEl = document.querySelector(`input[name="timepoints"][value="${initialTimepoints}"]`);
    if (tpEl) tpEl.checked = true;
  } else {
    const tpEl = document.querySelector(`input[name="timepoints"][value="timepoints_only"]`);
    if (tpEl) tpEl.checked = true;
  }

  showSelectedTimetable();

  // Apply timepoints visibility based on initial state
  const initialTimepointMode = getUrlParam('timepoints') || 'timepoints_only';
  if (initialTimepointMode === 'all_stops') {
    showAllTimetableStops();
  } else {
    hideNonTimepointColumns();
  }

  // If a stop_id was passed in URL, select it in the visible timetable
  if (initialStopId) {
    const visibleTimetable = getVisibleTimetable();
    if (visibleTimetable) {
      const timetableId = visibleTimetable.dataset.timetableId;
      selectStop(initialStopId, timetableId, {
        fromDropdown: false,
        showPopup: false, // Don't show popup on page load to avoid capturing keyboard focus
        updateUrl: false,
      });
    }
  }

  document.querySelectorAll('#day_list_selector input[name="dayList"]').forEach(function (input) {
    input.addEventListener('change', function () {
      const dayLabel = this.value === 'Sun' ? 'Sunday / Holiday' : this.value;
      setUrlParam('day_list', this.value);
      const visibleTimetable = getVisibleTimetable();
      if (visibleTimetable) {
        clearStopSelection(visibleTimetable.dataset.timetableId);
      }
      showSelectedTimetable();
      announceStatus(`Showing ${dayLabel} schedule`);
    });
  });

  document
    .querySelectorAll('#direction_name_selector input[name="directionId"]')
    .forEach(function (input) {
      input.addEventListener('change', function () {
        const directionLabel = this.closest('label').querySelector('span').textContent;
        setUrlParam('direction_id', this.value);
        const visibleTimetable = getVisibleTimetable();
        if (visibleTimetable) {
          clearStopSelection(visibleTimetable.dataset.timetableId);
        }
        showSelectedTimetable();
        announceStatus(`Showing ${directionLabel} direction`);
      });
    });

  // const isTimepoint = jQuery('#timepoint_selector input[name="timepoints"]:checked').val();
  // const timetableMain = jQuery('.timetable-main');

  document
    .querySelectorAll('#timepoint_selector input[name="timepoints"]')
    .forEach(function (input) {
      input.addEventListener('change', function () {
        const selectedValue = this.value;
        setUrlParam('timepoints', selectedValue);
        if (selectedValue === 'timepoints_only') {
          showSelectedTimetable();
          hideNonTimepointColumns();
          announceStatus('Showing timepoints only');
        } else {
          showSelectedTimetable();
          showAllTimetableStops();
          announceStatus('Showing all stops');
        }
      });
    });

  // Initialize stop search dropdowns with Tom Select for accessibility
  document.querySelectorAll('.stop-search-dropdown').forEach(function (selectEl) {
    const timetableId = selectEl.dataset.timetableId;

    stopSearchSelects[timetableId] = createAccessibleTomSelect(selectEl, {
      dropdownParent: `#stop-search-dropdown-container-${timetableId}`,
      labelId: `stop-search-label-${timetableId}`,
      placeholder: 'Select a stop on this route',
      onChange: function (value) {
        if (!value) {
          clearStopSelection(timetableId);
          return;
        }
        selectStop(value, timetableId, { fromDropdown: true, showPopup: false });
      },
    });
  });
});

/**
 * Resolves a stop_id to the one used in the timetable colgroup.
 * Handles parent_station relationships: if the given stopId is a platform
 * whose parent_station has a col, returns the parent_station stop_id.
 * @param {string} stopId - The stop_id to resolve
 * @param {NodeList} cols - The col elements from the timetable colgroup
 * @returns {string|null} The stop_id that matches a col, or null if not found
 */
function resolveColStopId(stopId, cols) {
  // Direct match
  for (const col of cols) {
    if (col.dataset.stopId === stopId) return stopId;
  }

  // stopId might be a platform whose parent_station has a col
  if (typeof stopData !== 'undefined' && stopData[stopId] && stopData[stopId].parent_station) {
    const parentId = stopData[stopId].parent_station;
    for (const col of cols) {
      if (col.dataset.stopId === parentId) return parentId;
    }
  }

  return null;
}

/**
 * Resolves a stop_id to one that exists in stopData.
 * If the given stopId is a parent_station not in stopData, finds the
 * child platform stop that references it.
 * @param {string} stopId - The stop_id to resolve
 * @returns {string|null} A stop_id that exists in stopData, or null
 */
function resolveDataStopId(stopId) {
  if (typeof stopData === 'undefined') return null;
  if (stopData[stopId]) return stopId;

  // stopId might be a parent_station — find a child platform
  for (const [childId, data] of Object.entries(stopData)) {
    if (data.parent_station === stopId) return childId;
  }

  return null;
}

/**
 * Clears the current stop selection for a timetable
 * @param {string} timetableId - The timetable ID
 */
function clearStopSelection(timetableId) {
  const table = document.getElementById(`timetable_main_${timetableId}`);
  if (table) {
    table.querySelectorAll('th.highlighted, td.highlighted, col.highlighted').forEach((el) => {
      el.classList.remove('highlighted');
    });
  }

  // Clear map highlight if available
  if (typeof maps !== 'undefined' && maps[timetableId]) {
    maps[timetableId].setFilter('stops-highlighted', ['==', 'stop_id', '']);
  }

  // Close any map popup
  if (typeof closeStopPopup === 'function') {
    closeStopPopup();
  }

  // Remove stop_id from URL
  const url = new URL(window.location);
  url.searchParams.delete('stop_id');
  window.history.replaceState({}, '', url);

  // Reset dropdown using Tom Select API
  if (stopSearchSelects[timetableId]) {
    stopSearchSelects[timetableId].clear(true); // true = silent, no change event
  }

  // Reset stop info container
  clearStopInfoContainer(timetableId);
}

/**
 * Clears the stop info container and shows the placeholder
 * @param {string} timetableId - The timetable ID
 */
function clearStopInfoContainer(timetableId) {
  const container = document.getElementById(`stop-info-${timetableId}`);
  if (!container) return;

  const placeholder = container.querySelector('.stop-info-placeholder');
  const content = container.querySelector('.stop-info-content');

  if (placeholder) placeholder.classList.remove('hidden');
  if (content) {
    content.classList.add('hidden');
    content.innerHTML = '';
  }
}

/**
 * Updates the stop info container with details about the selected stop
 * @param {string} stopId - The stop_id to display info for
 * @param {string} timetableId - The timetable ID
 */
function updateStopInfoContainer(stopId, timetableId) {
  const container = document.getElementById(`stop-info-${timetableId}`);
  if (!container) return;

  // Resolve parent_station if needed (stopId may be a parent not in stopData)
  const resolvedId = resolveDataStopId(stopId);
  if (!resolvedId) {
    console.warn(`Stop data not found for stop ${stopId}`);
    return;
  }

  const stop = stopData[resolvedId];
  const placeholder = container.querySelector('.stop-info-placeholder');
  const content = container.querySelector('.stop-info-content');

  if (!content) return;

  // Build the stop info HTML using template literals
  let htmlParts = [];

  const stop_heading = `${stop.stop_name}` + (stop.stop_code ? ` (${stop.stop_code})` : '');

  // Stop name
  htmlParts.push(`<div class="font-semibold text-lg mb-2">${escapeHtml(stop_heading)}</div>`);

  // Get route IDs for this stop from geojson
  let routeIds = [];
  if (typeof geojsons !== 'undefined' && geojsons[timetableId]) {
    const geojson = geojsons[timetableId];
    for (const feature of geojson.features) {
      if (
        feature.geometry.type.toLowerCase() === 'point' &&
        feature.properties.stop_id === stopId
      ) {
        routeIds = feature.properties.route_ids || [];
        break;
      }
    }
  }

  const rt_departures_link = stop.stop_id ? `/real-time-departures/?stop_id=${stop.stop_id}` : null;

  // Real-time departures if available
  if (typeof tripUpdates !== 'undefined' && tripUpdates) {
    const stopTimeUpdates = {
      0: [],
      1: [],
    };

    for (const tripUpdate of tripUpdates) {
      const stopTimeUpdatesForStop = tripUpdate.trip_update.stop_time_update.filter(
        (stopTimeUpdate) =>
          stopTimeUpdate.stop_id === resolvedId &&
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
      // Get route info from the timetable element's data-route-id and look up in routeData
      const timetableEl = document.querySelector('.timetable');
      const timetableRouteId = timetableEl ? timetableEl.dataset.routeId : null;
      const firstRouteId = timetableRouteId ? String(timetableRouteId).split('_')[0] : null;
      const route =
        firstRouteId && typeof routeData !== 'undefined' ? routeData[firstRouteId] : null;
      const routeLabel = route ? ` ${route.route_short_name}` : '';

      let departuresHtml = `<div class="mb-2">`;
      departuresHtml += `<div class="text-gray-600 mb-1">Upcoming ${routeLabel ? `${routeLabel}` : ''} Departures ${rt_departures_link ? `<a class="underline hover:no-underline" href="${rt_departures_link}">View All</a>` : ''}:</div>`;

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

          departuresHtml += `<div><b>${escapeHtml(directionName)}</b> in ${formattedDepartures} min</div>`;
        }
      }

      departuresHtml += `</div>`;
      htmlParts.push(departuresHtml);
    }
  }

  // Routes served
  if (routeIds.length > 0 && typeof routeData !== 'undefined') {
    const routeHtml = routeIds.map((routeId) => formatRoute(routeData[routeId])).join('');
    htmlParts.push(
      `<div class="mb-2"><span class="text-gray-600">Routes Served: </span><span class="route-list">${routeHtml}</span></div>`,
    );
  }

  // Streetview link
  if (stop.stop_lat && stop.stop_lon) {
    htmlParts.push(
      `<a class="btn-blue btn-sm inline-block mt-2" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${stop.stop_lat},${stop.stop_lon}&heading=0&pitch=0&fov=90" target="_blank" rel="noopener noreferrer">View on Streetview</a>`,
    );
  }

  // Update the container
  if (placeholder) placeholder.classList.add('hidden');
  content.innerHTML = `<div>${htmlParts.join('')}</div>`;
  content.classList.remove('hidden');
}

/**
 * Unified function to select a stop - coordinates map, table, and dropdown
 * @param {string} stopId - The stop_id to select
 * @param {string} timetableId - The timetable ID
 * @param {object} options - Options to control behavior
 * @param {boolean} options.fromDropdown - If true, don't update the dropdown (avoid loops)
 * @param {boolean} options.fromMap - If true, called from map click
 * @param {boolean} options.fromTable - If true, called from table click
 * @param {boolean} options.showPopup - If true, show the stop popup on the map
 * @param {boolean} options.updateUrl - If true (default), update the URL with stop_id param
 */
function selectStop(stopId, timetableId, options = {}) {
  const { updateUrl = true } = options;
  const tableContainer = document.getElementById(`table-container-${timetableId}`);
  const table = document.getElementById(`timetable_main_${timetableId}`);

  if (!tableContainer || !table) {
    console.warn(`Could not find table container or table for timetable: ${timetableId}`);
    return;
  }

  // Resolve parent_station relationships: the col may use a parent stop_id
  // while stopData uses the platform stop_id (or vice versa).
  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;

  const cols = colgroup.querySelectorAll('col');
  const colStopId = resolveColStopId(stopId, cols);
  const dataStopId = resolveDataStopId(stopId);

  if (!colStopId) {
    console.warn(`Stop ${stopId} not found in timetable ${timetableId}`);
    return;
  }

  // Use the data stop_id for URL and map (it's the platform-level ID)
  const urlStopId = dataStopId || stopId;

  // Update URL with stop_id (unless explicitly disabled, e.g., on initial page load)
  if (updateUrl) {
    setUrlParam('stop_id', urlStopId);
  }

  // Close any existing map popup, then optionally show new one
  if (typeof closeStopPopup === 'function') {
    closeStopPopup();
  }

  if (options.showPopup && typeof showStopPopupById === 'function') {
    showStopPopupById(urlStopId, timetableId);
  }

  // Find the column for this stop using the resolved col stop_id
  let targetCol = null;
  let colIndex = -1;

  cols.forEach((col, index) => {
    if (col.dataset.stopId === colStopId) {
      colIndex = index;
      targetCol = col;
    }
  });

  // Check if the stop is a non-timepoint and we're in timepoints-only mode
  const isTimepoint = targetCol.dataset.isTimepoint === 'true';
  const timetableEl = table.closest('.timetable');
  const isTimepointsOnlyMode = timetableEl && timetableEl.dataset.stops === 'timepoints-only';

  if (!isTimepoint && isTimepointsOnlyMode) {
    // Switch to "all stops" view
    const allStopsInput = document.querySelector(
      '#timepoint_selector input[name="timepoints"][value="all_stops"]',
    );
    if (allStopsInput) allStopsInput.checked = true;
    setUrlParam('timepoints', 'all_stops');
    showSelectedTimetable();
    showAllTimetableStops();
  }

  // Remove existing highlights from this table
  table.querySelectorAll('th.highlighted, td.highlighted, col.highlighted').forEach((el) => {
    el.classList.remove('highlighted');
  });

  // Add highlight to the col element
  targetCol.classList.add('highlighted');

  // Find and highlight the header cell
  const stopHeaders = table.querySelectorAll(
    'thead th.stop-header:not(.continues-from):not(.continues-as)',
  );
  const headerCell = stopHeaders[colIndex];

  if (headerCell) {
    headerCell.classList.add('highlighted');

    // Scroll the header into view within the table container
    const scrollLeft =
      headerCell.offsetLeft - tableContainer.clientWidth / 2 + headerCell.offsetWidth / 2;
    tableContainer.scrollTo({
      left: Math.max(0, scrollLeft),
      behavior: 'smooth',
    });
  }

  // Highlight all body cells in that column
  table.querySelectorAll('tbody tr').forEach((row) => {
    const stopCells = row.querySelectorAll('td:not(.trip-notes):not(.continues-from)');
    if (stopCells[colIndex]) {
      stopCells[colIndex].classList.add('highlighted');
    }
  });

  // Update the dropdown selection (unless called from dropdown to avoid loops)
  // Use colStopId since dropdown options match col data-stop-id values
  if (!options.fromDropdown) {
    if (stopSearchSelects[timetableId]) {
      const currentVal = stopSearchSelects[timetableId].getValue();
      if (currentVal !== colStopId) {
        stopSearchSelects[timetableId].setValue(colStopId, true); // true = silent, no change event
      }
    }
  }

  // Update the map highlight (unless already handled by caller)
  // Use both the col and data stop IDs to ensure the marker is highlighted
  if (typeof maps !== 'undefined' && maps[timetableId]) {
    const map = maps[timetableId];
    const filterIds = [colStopId];
    if (dataStopId && dataStopId !== colStopId) filterIds.push(dataStopId);
    map.setFilter('stops-highlighted', [
      'any',
      ['in', 'stop_id', ...filterIds],
      ['in', 'parent_station', ...filterIds],
    ]);
  }

  // Update the stop info container with stop details (use data stop ID for stopData lookup)
  updateStopInfoContainer(dataStopId || stopId, timetableId);
}

// Refresh stop info container when real-time data becomes available
document.addEventListener('tripUpdatesReady', () => {
  const selectedStopId = getUrlParam('stop_id');
  if (!selectedStopId) return;

  const visibleTimetable = getVisibleTimetable();
  if (visibleTimetable) {
    updateStopInfoContainer(selectedStopId, visibleTimetable.dataset.timetableId);
  }
});

// Legacy function for compatibility - now calls selectStop
function highlightAndScrollToStop(stopId, timetableId) {
  selectStop(stopId, timetableId);
}
