/* global jQuery, TomSelect */
/* eslint no-unused-vars: "off" */

// Global object to store Tom Select instances by timetable ID
const stopSearchSelects = {};

/**
 * Announces a status message to screen readers via the live region
 * @param {string} message - The message to announce
 */
function announceStatus(message) {
  const statusEl = jQuery('#timetable_status');
  if (statusEl.length) {
    statusEl.text(message);
  }
}

function showSelectedTimetable() {
  if (jQuery('.timetable').length === 1) {
    showTimetable(jQuery('.timetable').data('timetable-id'));
    return false;
  }

  jQuery('#day_list_selector input[name="dayList"]').each((index, element) => {
    jQuery(element).parents('label').toggleClass('btn-blue', jQuery(element).is(':checked'));
    jQuery(element).parents('label').toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
  });

  jQuery('#direction_name_selector input[name="directionId"]').each((index, element) => {
    jQuery(element).parents('label').toggleClass('btn-blue', jQuery(element).is(':checked'));
    jQuery(element).parents('label').toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
  });

  jQuery('#timepoint_selector input[name="timepoints"]').each((index, element) => {
    jQuery(element).parents('label').toggleClass('btn-blue', jQuery(element).is(':checked'));
    jQuery(element).parents('label').toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
  });

  const dayList = jQuery('#day_list_selector input[name="dayList"]:checked').val();

  const directionId = jQuery('#direction_name_selector input[name="directionId"]:checked').val();

  jQuery('.timetable').hide();
  jQuery('.coa-timetable-map-container').hide();

  console.log(`Showing timetable for day list: ${dayList}, direction ID: ${directionId}`);

  const id = jQuery(
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`,
  ).data('timetable-id');

  showTimetable(id);
}

function showTimetable(id) {
  jQuery(`#timetable_id_${id}`).show();
  jQuery(`#coa_map_container_${id}`).show();
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

function hideTimepointColumns() {
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

function showAllTimepoints() {
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

jQuery(() => {
  console.log('Timetable menu JS loaded, initializing...');

  const initialDirection = getUrlParam('direction_id');
  const initialDayList = getUrlParam('day_list');
  const initialTimepoints = getUrlParam('timepoints');
  const initialStopId = getUrlParam('stop_id');

  const today_day_of_week = new Date().getDay();

  let default_timetable_day;
  let default_direction_id = 0;

  if (today_day_of_week === 6) {
    default_timetable_day = 'Sat';
  } else if (today_day_of_week === 0) {
    default_timetable_day = 'Sun';
  } else {
    default_timetable_day = 'Mon-Fri';
  }

  const this_route_direction_ids = [
    ...new Set(
      jQuery('input[name="directionId"]')
        .map((_, el) => jQuery(el).val())
        .get(),
    ),
  ];

  if (this_route_direction_ids.length > 0) {
    default_direction_id = this_route_direction_ids[0];
  }

  if (initialDirection) {
    console.log('Setting initial direction to: ', initialDirection);
    jQuery('input[name="directionId"][value="' + initialDirection + '"]').prop('checked', true);
  } else {
    console.log('Setting initial direction to default: ', 0);
    jQuery('input[name="directionId"][value="' + default_direction_id + '"]').prop('checked', true);
  }

  if (initialDayList) {
    console.log('Setting initial day list to', initialDayList);
    jQuery('input[name="dayList"][value="' + initialDayList + '"]').prop('checked', true);
  } else {
    console.log(`Setting initial day list to ${default_timetable_day}`);
    jQuery(`input[name="dayList"][value="${default_timetable_day}"]`).prop('checked', true);
  }

  if (
    initialTimepoints &&
    (initialTimepoints === 'timepoints_only' || initialTimepoints === 'all_stops')
  ) {
    console.log('Setting initial timepoints to', initialTimepoints);
    jQuery(`input[name="timepoints"][value="${initialTimepoints}"]`).prop('checked', true);
  } else {
    console.log('Setting initial stops to timepoints only view');
    jQuery(`input[name="timepoints"][value="timepoints_only"]`).prop('checked', true);
  }

  showSelectedTimetable();

  // Apply timepoints visibility based on initial state
  if (jQuery('#timepoint_selector input[name="timepoints"]:checked').val() === 'all_stops') {
    showAllTimepoints();
  } else {
    hideTimepointColumns();
  }

  // If a stop_id was passed in URL, select it in the visible timetable
  if (initialStopId) {
    const visibleTimetable = jQuery('.timetable:visible').first();
    if (visibleTimetable.length) {
      const timetableId = visibleTimetable.data('timetable-id');
      console.log('Selecting initial stop:', initialStopId, 'in timetable:', timetableId);
      selectStop(initialStopId, timetableId, {
        fromDropdown: false,
        showPopup: false, // Don't show popup on page load to avoid capturing keyboard focus
        updateUrl: false,
      });
    }
  }

  jQuery('#day_list_selector input[name="dayList"]').change(function () {
    const dayLabel = jQuery(this).val() === 'Sun' ? 'Sunday / Holiday' : jQuery(this).val();
    setUrlParam('day_list', jQuery(this).val());
    showSelectedTimetable();
    announceStatus(`Showing ${dayLabel} schedule`);
  });

  jQuery('#direction_name_selector input[name="directionId"]').change(function () {
    const directionLabel = jQuery(this).siblings('span').text();
    setUrlParam('direction_id', jQuery(this).val());
    showSelectedTimetable();
    announceStatus(`Showing ${directionLabel} direction`);
  });

  // const isTimepoint = jQuery('#timepoint_selector input[name="timepoints"]:checked').val();
  // const timetableMain = jQuery('.timetable-main');

  jQuery('#timepoint_selector input[name="timepoints"]').change(function () {
    const selectedValue = jQuery(this).val();
    setUrlParam('timepoints', selectedValue);
    if (selectedValue === 'timepoints_only') {
      showSelectedTimetable();
      hideTimepointColumns();
      announceStatus('Showing timepoints only');
    } else {
      showSelectedTimetable();
      showAllTimepoints();
      announceStatus('Showing all stops');
    }
  });

  // Initialize stop search dropdowns with Tom Select for accessibility
  jQuery('.stop-search-dropdown').each(function () {
    const selectEl = this;
    const timetableId = jQuery(selectEl).data('timetable-id');

    stopSearchSelects[timetableId] = new TomSelect(selectEl, {
      create: false,
      openOnFocus: true,
      maxOptions: null,
      sortField: { field: 'text', direction: 'asc' },
      placeholder: 'Select a stop on this route',
      dropdownParent: 'body',
      onChange: function (value) {
        if (!value) {
          // Clear selection and remove from URL
          clearStopSelection(timetableId);
          const url = new URL(window.location);
          url.searchParams.delete('stop_id');
          window.history.replaceState({}, '', url);
          return;
        }
        selectStop(value, timetableId, { fromDropdown: true, showPopup: false });
      },
    });
  });
});

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

  // Get stop data (globally available from timetablepage.pug)
  if (typeof stopData === 'undefined' || !stopData[stopId]) {
    console.warn(`Stop data not found for stop ${stopId}`);
    return;
  }

  const stop = stopData[stopId];
  const placeholder = container.querySelector('.stop-info-placeholder');
  const content = container.querySelector('.stop-info-content');

  if (!content) return;

  // Build the stop info HTML
  const html = jQuery('<div>');

  const stop_heading = `${stop.stop_name}` + (stop.stop_code ? ` (${stop.stop_code})` : '');

  // Stop name
  jQuery('<div>').addClass('font-semibold text-lg mb-2').text(stop_heading).appendTo(html);

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
          stopTimeUpdate.stop_id === stopId &&
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
      const departuresDiv = jQuery('<div>').addClass('mb-2');

      // Get route info from the timetable element's data-route-id and look up in routeData
      const timetableEl = jQuery(`.timetable`).first();
      const timetableRouteId = timetableEl.data('route-id');
      // route_id may be a single ID or multiple IDs joined by '_'
      const firstRouteId = timetableRouteId ? String(timetableRouteId).split('_')[0] : null;
      const route =
        firstRouteId && typeof routeData !== 'undefined' ? routeData[firstRouteId] : null;
      const routeLabel = route ? ` ${route.route_short_name}` : '';

      jQuery('<div>')
        .addClass('text-gray-600 mb-1')
        .html(
          `Upcoming ${routeLabel ? `${routeLabel}` : ''} Departures ${rt_departures_link ? `<a class="underline hover:no-underline" href="${rt_departures_link}">View All</a>` : ''}:`,
        )
        .appendTo(departuresDiv);

      for (const direction of ['0', '1']) {
        if (stopTimeUpdates[direction].length > 0) {
          const directionName = jQuery(`.timetable[data-direction-id="${direction}"]`).data(
            'direction-name',
          );
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

          jQuery('<div>')
            .html(`<b>${directionName}</b> in ${formattedDepartures} min`)
            .appendTo(departuresDiv);
        }
      }

      departuresDiv.appendTo(html);
    }
  }

  // Routes served
  if (routeIds.length > 0 && typeof routeData !== 'undefined') {
    jQuery('<div>')
      .addClass('mb-2')
      .html([
        jQuery('<span>').addClass('text-gray-600').text('Routes Served: '),
        jQuery('<span>')
          .addClass('route-list')
          .html(routeIds.map((routeId) => formatRoute(routeData[routeId]))),
      ])
      .appendTo(html);
  }

  // Streetview link
  if (stop.stop_lat && stop.stop_lon) {
    jQuery('<a>')
      .addClass('btn-blue btn-sm inline-block mt-2')
      .prop(
        'href',
        `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${stop.stop_lat},${stop.stop_lon}&heading=0&pitch=0&fov=90`,
      )
      .prop('target', '_blank')
      .prop('rel', 'noopener noreferrer')
      .html('View on Streetview')
      .appendTo(html);
  }

  // Update the container
  if (placeholder) placeholder.classList.add('hidden');
  content.innerHTML = html.prop('outerHTML');
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

  // Update URL with stop_id (unless explicitly disabled, e.g., on initial page load)
  if (updateUrl) {
    setUrlParam('stop_id', stopId);
  }

  // Close any existing map popup, then optionally show new one
  if (typeof closeStopPopup === 'function') {
    closeStopPopup();
  }

  if (options.showPopup && typeof showStopPopupById === 'function') {
    showStopPopupById(stopId, timetableId);
  }

  // Find the column for this stop using the colgroup
  const colgroup = table.querySelector('colgroup');
  if (!colgroup) return;

  const cols = colgroup.querySelectorAll('col');
  let targetCol = null;
  let colIndex = -1;

  cols.forEach((col, index) => {
    if (col.dataset.stopId === stopId) {
      colIndex = index;
      targetCol = col;
    }
  });

  if (colIndex === -1 || !targetCol) {
    console.warn(`Stop ${stopId} not found in timetable ${timetableId}`);
    return;
  }

  // Check if the stop is a non-timepoint and we're in timepoints-only mode
  const isTimepoint = targetCol.dataset.isTimepoint === 'true';
  const timetableEl = table.closest('.timetable');
  const isTimepointsOnlyMode = timetableEl && timetableEl.dataset.stops === 'timepoints-only';

  if (!isTimepoint && isTimepointsOnlyMode) {
    // Switch to "all stops" view
    jQuery('#timepoint_selector input[name="timepoints"][value="all_stops"]').prop('checked', true);
    setUrlParam('timepoints', 'all_stops');
    showSelectedTimetable();
    showAllTimepoints();

    // Update button styling
    jQuery('#timepoint_selector input[name="timepoints"]').each((index, element) => {
      jQuery(element).parents('label').toggleClass('btn-blue', jQuery(element).is(':checked'));
      jQuery(element)
        .parents('label')
        .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
    });
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
  if (!options.fromDropdown) {
    if (stopSearchSelects[timetableId]) {
      const currentVal = stopSearchSelects[timetableId].getValue();
      if (currentVal !== stopId) {
        stopSearchSelects[timetableId].setValue(stopId, true); // true = silent, no change event
      }
    }
  }

  // Update the map highlight (unless already handled by caller)
  if (typeof maps !== 'undefined' && maps[timetableId]) {
    const map = maps[timetableId];
    map.setFilter('stops-highlighted', [
      'any',
      ['in', 'stop_id', stopId],
      ['in', 'parent_station', stopId],
    ]);
  }

  // Update the stop info container with stop details
  updateStopInfoContainer(stopId, timetableId);
}

// Legacy function for compatibility - now calls selectStop
function highlightAndScrollToStop(stopId, timetableId) {
  selectStop(stopId, timetableId);
}
