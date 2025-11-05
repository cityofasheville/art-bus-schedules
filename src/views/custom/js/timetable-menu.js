/* global jQuery */
/* eslint no-unused-vars: "off" */

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
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`
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
        .get()
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

  console.log(`Setting initial stops to timepopints only view`);
  jQuery(`input[name="timepoints"][value="timepoints_only"]`).prop('checked', true);

  showSelectedTimetable();
  hideTimepointColumns();

  jQuery('#day_list_selector input[name="dayList"]').change(() => {
    showSelectedTimetable();
  });

  jQuery('#direction_name_selector input[name="directionId"]').change(() => {
    showSelectedTimetable();
  });

  // const isTimepoint = jQuery('#timepoint_selector input[name="timepoints"]:checked').val();
  // const timetableMain = jQuery('.timetable-main');

  jQuery('#timepoint_selector input[name="timepoints"]').change(() => {
    if (
      jQuery('#timepoint_selector input[name="timepoints"]:checked').val() === 'timepoints_only'
    ) {
      showSelectedTimetable();
      hideTimepointColumns();
      // if (timetableMain) {
      //   timetableMain.attr('data-stops', 'timepoints-only');
      // }
    } else {
      showSelectedTimetable();
      showAllTimepoints();
      // if (timetableMain) {
      //   timetableMain.attr('data-stops', 'all-stops');
      // }
    }
  });
});
