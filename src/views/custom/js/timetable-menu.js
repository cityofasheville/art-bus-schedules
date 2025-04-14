/* global jQuery */
/* eslint no-unused-vars: "off" */

function showSelectedTimetable() {
  if (jQuery('.timetable').length === 1) {
    showTimetable(jQuery('.timetable').data('timetable-id'));
    return false;
  }

  jQuery('#day_list_selector input[name="dayList"]').each((index, element) => {
    jQuery(element)
      .parents('label')
      .toggleClass('btn-blue', jQuery(element).is(':checked'));
    jQuery(element)
      .parents('label')
      .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
  });

  jQuery('#direction_name_selector input[name="directionId"]').each(
    (index, element) => {
      jQuery(element)
        .parents('label')
        .toggleClass('btn-blue', jQuery(element).is(':checked'));
      jQuery(element)
        .parents('label')
        .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
    },
  );

  jQuery('#timepoint_selector input[name="timepoints"]').each(
    (index, element) => {
      jQuery(element)
        .parents('label')
        .toggleClass('btn-blue', jQuery(element).is(':checked'));
      jQuery(element)
        .parents('label')
        .toggleClass('btn-gray', jQuery(element).is(':not(:checked)'));
    },
  );

  const dayList = jQuery(
    '#day_list_selector input[name="dayList"]:checked',
  ).val();

  const directionId = jQuery(
    '#direction_name_selector input[name="directionId"]:checked',
  ).val();

  jQuery('.timetable').hide();

  const id = jQuery(
    `.timetable[data-day-list="${dayList}"][data-direction-id="${directionId}"]`,
  ).data('timetable-id');

  showTimetable(id);
}

function showTimetable(id) {
  jQuery(`#timetable_id_${id}`).show();
  toggleMap(id);
}

function hideTimepointColumns() {
  const timetables = document.querySelectorAll('.timetable');

  timetables.forEach(table => {
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

    columnsToHideIndices.forEach(index => {
      if (colElements[index]) {
        colElements[index].style.display = 'none';
      }
    });

    // Optionally, hide header and body cells for consistency
    const theadRow = table.querySelector('thead tr');
    const tbodyRows = table.querySelectorAll('tbody tr');

    if (theadRow) {
      const headerCells = theadRow.querySelectorAll('th');
      columnsToHideIndices.forEach(index => {
        if (headerCells[index]) {
          headerCells[index].style.display = 'none';
        }
      });
    }

    tbodyRows.forEach(row => {
      const cells = row.querySelectorAll('td');
      columnsToHideIndices.forEach(index => {
        if (cells[index]) {
          cells[index].style.display = 'none';
        }
      });
    });
  });
}

function showAllTimepoints() {
  const timetables = document.querySelectorAll('.timetable');

  timetables.forEach(table => {
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
      tbodyRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells[index]) {
          cells[index].style.display = '';
        }
      });
    });
  });
}

jQuery(() => {
  showSelectedTimetable();
  hideTimepointColumns();

  jQuery('#day_list_selector input[name="dayList"]').change(() => {
    showSelectedTimetable();
  });

  jQuery('#direction_name_selector input[name="directionId"]').change(() => {
    showSelectedTimetable();
  });

  const isTimepoint = jQuery('#timepoint_selector input[name="timepoints"]:checked').val();

  jQuery('#timepoint_selector input[name="timepoints"]').change(() => {
    if (jQuery('#timepoint_selector input[name="timepoints"]:checked').val() === 'timepoints_only'){
      showSelectedTimetable();
      hideTimepointColumns();
    } else {
      showSelectedTimetable();
      showAllTimepoints();
    }
  });

});