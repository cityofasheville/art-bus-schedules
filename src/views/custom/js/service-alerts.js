/* global jQuery, anchorme, Pbf, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

let gtfsRealtimeAlertsInterval;

// Store processed alerts globally for filtering
let processedAlerts = {
  systemWide: [],
  byRoute: {},
};

// Currently selected route for filtering alerts (null = system-wide "ART")
let selectedRouteId = null;

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

function formatAlertAsHtml(alert) {
  const $alert = jQuery('<details>').addClass('bg-white border border-slate-300 rounded mb-4');

  // Build route swatches for this specific alert
  let routeSwatchesHtml = '';
  if (alert.routes_affected && alert.routes_affected.length > 0) {
    routeSwatchesHtml = '<ul class="flex flex-wrap gap-1 list-none p-0 m-0 mb-2">';
    alert.routes_affected.forEach((route) => {
      if (route) {
        routeSwatchesHtml += `<li class="route-color-swatch" style="background-color: #${route.route_color || '000000'};color: #${route.route_text_color || 'FFFFFF'};" title="${route.route_long_name || 'Route ' + route.route_short_name}" aria-label="${route.route_long_name || 'Route ' + route.route_short_name}">${route.route_short_name}</li>`;
      }
    });
    routeSwatchesHtml += '</ul>';
  } else {
    // System-wide alert
    routeSwatchesHtml =
      '<ul class="flex flex-wrap gap-1 list-none p-0 m-0 mb-2"><li class="route-color-swatch" style="background-color: #1e3a5f; color: #FFFFFF;" title="System wide" aria-label="System wide">ART</li></ul>';
  }

  // Build affected stops HTML
  let affectedStopsHtml = '';
  if (alert.stops_affected && alert.stops_affected.length > 0) {
    affectedStopsHtml =
      '<div class="mt-4 border-t border-gray-300 pt-2"><span class="font-semibold">Stops Affected:</span><ul class="list-disc pl-4 mt-2">';
    alert.stops_affected.forEach((stop) => {
      if (stop) {
        affectedStopsHtml += `<li class="my-1">${stop.stop_name}</li>`;
      }
    });
    affectedStopsHtml += '</ul></div>';
  }

  // Build timespan text
  const timespanText = alert.valid_timespans
    .map((timespan) => {
      const startDate = timespan.start
        ? new Date(timespan.start * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'N/A';
      const endDate = timespan.end
        ? new Date(timespan.end * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'Ongoing';
      return `${startDate} - ${endDate}`;
    })
    .join(', ');

  // Determine active vs future status badge
  const statusBadge = alert.isCurrentlyActive
    ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" aria-label="Currently active">Active</span>'
    : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" aria-label="Upcoming alert">Upcoming</span>';

  $alert.html(`
    <summary class="list-none flex gap-4 align-middle justify-between py-3 px-4 cursor-pointer border-l-4 border-aux-red">
      <div class="flex flex-col text-art-blue gap-1">
        
        ${routeSwatchesHtml}

        <div class="flex items-center gap-2">
          <span class="text-lg font-medium">${alert.title}</span>
        </div>

        <div class="text-sm text-gray-600">${timespanText}</div>
                 
        <div class="">${statusBadge}</div>
        
      </div>
      <div class="flex items-center">
        <span class="bi bi-chevron-down text-xl" aria-hidden="true"></span>
      </div>
    </summary>
    <div class="p-4 border-t border-slate-300">
      <p>${alert.description}</p>
      ${affectedStopsHtml}
    </div>
  `);

  return $alert;
}

// Render clickable route swatches for all affected routes
function renderRouteSelector() {
  const $routeList = jQuery('#alerts-route-list');
  $routeList.empty();

  const hasSystemWide = processedAlerts.systemWide.length > 0;
  const affectedRoutes = Object.keys(processedAlerts.byRoute);

  if (!hasSystemWide && affectedRoutes.length === 0) {
    jQuery('#alerts-loading-message').text('No service alerts at this time.').show();
    jQuery('#alerts-select-prompt').hide();
    return;
  }

  jQuery('#alerts-loading-message').hide();
  jQuery('#alerts-select-prompt').show();

  let isFirst = true;

  // Add system-wide "ART" swatch first if there are system-wide alerts
  if (hasSystemWide) {
    const $artTab = jQuery('<button>')
      .attr('role', 'tab')
      .attr('id', 'alert-tab-system-wide')
      .attr('aria-selected', isFirst ? 'true' : 'false')
      .attr('aria-controls', 'alerts-display-container')
      .attr('tabindex', isFirst ? '0' : '-1')
      .attr('type', 'button')
      .attr('data-route-id', 'system-wide')
      .addClass(
        'route-color-swatch-large cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-art-blue focus:ring-2 focus:ring-offset-2 focus:ring-art-blue transition-all',
      )
      .css({ 'background-color': '#1e3a5f', color: '#FFFFFF' })
      .attr(
        'aria-label',
        `System-wide alerts (${processedAlerts.systemWide.length} alert${processedAlerts.systemWide.length > 1 ? 's' : ''})`,
      )
      .attr('title', `System-wide alerts (${processedAlerts.systemWide.length})`)
      .text('ART');
    $routeList.append($artTab);
    isFirst = false;
  }

  // Add route swatches sorted by route_short_name
  const sortedRouteIds = affectedRoutes.sort((a, b) => {
    const routeA = routeData[a];
    const routeB = routeData[b];
    return (routeA?.route_short_name || '').localeCompare(
      routeB?.route_short_name || '',
      undefined,
      { numeric: true },
    );
  });

  sortedRouteIds.forEach((routeId) => {
    const route = routeData[routeId];
    if (!route) return;

    const alertCount = processedAlerts.byRoute[routeId].length;
    const $routeTab = jQuery('<button>')
      .attr('role', 'tab')
      .attr('id', `alert-tab-${routeId}`)
      .attr('aria-selected', isFirst ? 'true' : 'false')
      .attr('aria-controls', 'alerts-display-container')
      .attr('tabindex', isFirst ? '0' : '-1')
      .attr('type', 'button')
      .attr('data-route-id', routeId)
      .addClass(
        'route-color-swatch-large cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-art-blue focus:ring-2 focus:ring-offset-2 focus:ring-art-blue transition-all',
      )
      .css({
        'background-color': `#${route.route_color || '000000'}`,
        color: `#${route.route_text_color || 'FFFFFF'}`,
      })
      .attr(
        'aria-label',
        `${route.route_long_name || 'Route ' + route.route_short_name} (${alertCount} alert${alertCount > 1 ? 's' : ''})`,
      )
      .attr(
        'title',
        `${route.route_long_name || 'Route ' + route.route_short_name} (${alertCount})`,
      )
      .text(route.route_short_name);
    $routeList.append($routeTab);
    isFirst = false;
  });

  // Add "All Alerts" option at the end
  const totalAlertCount =
    processedAlerts.systemWide.length +
    Object.values(processedAlerts.byRoute).reduce((sum, alerts) => sum + alerts.length, 0);
  const $allTab = jQuery('<button>')
    .attr('role', 'tab')
    .attr('id', 'alert-tab-all')
    .attr('aria-selected', isFirst ? 'true' : 'false')
    .attr('aria-controls', 'alerts-display-container')
    .attr('tabindex', isFirst ? '0' : '-1')
    .attr('type', 'button')
    .attr('data-route-id', 'all')
    .addClass(
      'route-color-swatch-large cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-art-blue focus:ring-2 focus:ring-offset-2 focus:ring-art-blue transition-all',
    )
    .css({ 'background-color': '#4b5563', color: '#FFFFFF' })
    .attr('aria-label', `All alerts (${totalAlertCount} alert${totalAlertCount > 1 ? 's' : ''})`)
    .attr('title', `All alerts (${totalAlertCount})`)
    .text('All');
  $routeList.append($allTab);

  // Attach event handlers using event delegation on the tablist
  $routeList
    .off('click keydown') // Remove any existing handlers
    .on('click', '[role="tab"]', function () {
      selectRoute(jQuery(this).attr('data-route-id'));
    })
    .on('keydown', '[role="tab"]', function (e) {
      handleTabKeydown(e);
    });
}

// Handle keyboard navigation for tabs (arrow keys, Home, End)
function handleTabKeydown(e) {
  const $tabs = jQuery('#alerts-route-list [role="tab"]');
  const $currentTab = jQuery(e.target);
  const currentIndex = $tabs.index($currentTab);

  if (currentIndex === -1) return;

  let newIndex = currentIndex;

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      newIndex = (currentIndex + 1) % $tabs.length;
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      newIndex = (currentIndex - 1 + $tabs.length) % $tabs.length;
      break;
    case 'Home':
      newIndex = 0;
      break;
    case 'End':
      newIndex = $tabs.length - 1;
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      selectRoute($currentTab.attr('data-route-id'));
      return;
    default:
      return; // Exit if the key is not recognized
  }

  e.preventDefault();
  $tabs.eq(newIndex).focus();
}

// Handle route selection and display related alerts
function selectRoute(routeId) {
  selectedRouteId = routeId;
  const $tabs = jQuery('#alerts-route-list [role="tab"]');
  const $selectedTab = jQuery(`#alerts-route-list [data-route-id="${routeId}"]`);

  // Update all tabs: set aria-selected and tabindex
  $tabs.each(function () {
    const $tab = jQuery(this);
    const isSelected = $tab.attr('data-route-id') === routeId;
    $tab
      .attr('aria-selected', isSelected ? 'true' : 'false')
      .attr('tabindex', isSelected ? '0' : '-1')
      .toggleClass('ring-4 ring-art-blue ring-offset-2', isSelected);
  });

  // Update tabpanel's aria-labelledby to reference the selected tab
  jQuery('#alerts-display-container').attr('aria-labelledby', $selectedTab.attr('id'));

  // Display alerts for selected route
  displayAlertsForRoute(routeId);
}

// Display alerts for the selected route in the target container
function displayAlertsForRoute(routeId) {
  const $container = jQuery('#alerts-display-container');
  $container.empty();

  jQuery('#alerts-select-prompt').hide();

  let alerts = [];
  let headerText = '';

  if (routeId === 'all') {
    // Combine all alerts, avoiding duplicates by alert id
    const seenIds = new Set();
    processedAlerts.systemWide.forEach((alert) => {
      if (!seenIds.has(alert.id)) {
        alerts.push(alert);
        seenIds.add(alert.id);
      }
    });
    Object.values(processedAlerts.byRoute).forEach((routeAlerts) => {
      routeAlerts.forEach((alert) => {
        if (!seenIds.has(alert.id)) {
          alerts.push(alert);
          seenIds.add(alert.id);
        }
      });
    });
    headerText = 'All Service Alerts';
  } else if (routeId === 'system-wide') {
    alerts = processedAlerts.systemWide;
    headerText = 'System-wide Alerts';
  } else {
    alerts = processedAlerts.byRoute[routeId] || [];
    const route = routeData[routeId];
    headerText = route
      ? `Alerts affecting ${route.route_short_name} - ${route.route_long_name}`
      : 'Route Alerts';
  }

  if (alerts.length === 0) {
    $container.append('<p class="text-gray-600">No alerts for this selection.</p>');
    return;
  }

  const $header = jQuery('<h3>').addClass('text-xl font-semibold mb-4 text-black').text(headerText);
  $container.append($header);

  const $alertsList = jQuery('<div>').addClass('alerts-list');
  alerts.forEach((alert) => {
    $alertsList.append(formatAlertAsHtml(alert));
  });
  $container.append($alertsList);
}

async function updateAlerts() {
  if (!gtfsRealtimeUrls?.realtimeAlerts) {
    jQuery('#alerts-loading-message').text('No alerts feed configured.').show();
    return;
  }

  const now = new Date();
  const current_timestamp = Math.floor(now.getTime() / 1000);
  const two_weeks_from_now = current_timestamp + 14 * 24 * 60 * 60;

  try {
    const alerts = await fetchGtfsRealtime(
      gtfsRealtimeUrls.realtimeAlerts.url,
      gtfsRealtimeUrls.realtimeAlerts.headers,
    );

    if (!alerts) {
      jQuery('#alerts-loading-message').text('No service alerts at this time.').show();
      return;
    }

    // Reset processed alerts
    processedAlerts = { systemWide: [], byRoute: {} };

    const active_alerts = alerts.filter((alert) => {
      if (!alert.alert || alert.alert.is_deleted) {
        return false;
      }
      let isActive = false;
      let this_timespan = alert.alert.active_period;

      if (this_timespan) {
        for (const timespan of this_timespan) {
          if (
            (!timespan.start || timespan.start <= two_weeks_from_now) &&
            (!timespan.end || timespan.end >= current_timestamp)
          ) {
            isActive = true;
            break;
          }
        }
      }
      return isActive;
    });

    // Process each active alert
    for (const alert of active_alerts) {
      if (!alert.alert || alert.alert.is_deleted) {
        continue;
      }

      // Determine if alert is currently active (has started) vs future (not yet started)
      const timespans = alert.alert.active_period || [];
      const isCurrentlyActive = timespans.some((timespan) => {
        // Alert is active if it has no start time OR start time is in the past/present
        return !timespan.start || timespan.start <= current_timestamp;
      });

      // Build processed alert object
      const processedAlert = {
        id: alert.id,
        title: alert.alert.header_text.translation[0].text,
        description: alert.alert.description_text.translation[0].text,
        routes_affected: [],
        stops_affected: [],
        valid_timespans: timespans,
        url: alert.alert.url?.translation?.[0]?.text || null,
        isCurrentlyActive: isCurrentlyActive,
      };

      // Collect affected routes
      const affectedRouteIds = new Set();
      alert.alert.informed_entity.forEach((entity) => {
        if (entity.route_id !== undefined && entity.route_id !== '') {
          affectedRouteIds.add(entity.route_id);
          const route = routeData[entity.route_id];
          if (
            route &&
            !processedAlert.routes_affected.some((r) => r.route_id === entity.route_id)
          ) {
            processedAlert.routes_affected.push(route);
          }
        }
      });

      // Collect affected stops
      alert.alert.informed_entity.forEach((entity) => {
        if (entity.stop_id !== undefined && entity.stop_id !== '') {
          const stop = stopData[entity.stop_id];
          if (stop && !processedAlert.stops_affected.some((s) => s.stop_id === entity.stop_id)) {
            processedAlert.stops_affected.push(stop);
          }
        }
      });

      // Filter to only routes/stops in this timetable
      const affectedRouteIdsInTimetable = routeIds.filter((routeId) =>
        affectedRouteIds.has(routeId),
      );
      const affectedStopIdsInTimetable = processedAlert.stops_affected.filter((stop) =>
        stopIds.includes(stop.stop_id),
      );

      // Skip alerts that don't affect any routes or stops in this timetable (unless system-wide)
      if (
        affectedRouteIdsInTimetable.length === 0 &&
        affectedStopIdsInTimetable.length === 0 &&
        processedAlert.routes_affected.length > 0
      ) {
        continue;
      }

      // Categorize alert
      if (processedAlert.routes_affected.length === 0) {
        // System-wide alert
        processedAlerts.systemWide.push(processedAlert);
      } else {
        // Route-specific alert - add to each affected route
        affectedRouteIdsInTimetable.forEach((routeId) => {
          if (!processedAlerts.byRoute[routeId]) {
            processedAlerts.byRoute[routeId] = [];
          }
          // Avoid duplicates
          if (!processedAlerts.byRoute[routeId].some((a) => a.id === processedAlert.id)) {
            processedAlerts.byRoute[routeId].push(processedAlert);
          }
        });
      }
    }

    // Render the route selector UI
    renderRouteSelector();

    // Auto-select first available option
    if (processedAlerts.systemWide.length > 0) {
      selectRoute('system-wide');
    } else {
      const firstRouteId = Object.keys(processedAlerts.byRoute).sort((a, b) => {
        const routeA = routeData[a];
        const routeB = routeData[b];
        return (routeA?.route_short_name || '').localeCompare(
          routeB?.route_short_name || '',
          undefined,
          { numeric: true },
        );
      })[0];
      if (firstRouteId) {
        selectRoute(firstRouteId);
      }
    }
  } catch (error) {
    console.error('Error updating alerts:', error);
    jQuery('#alerts-loading-message').text('Error loading service alerts.').show();
  }
}

jQuery(() => {
  if (gtfsRealtimeUrls?.realtimeAlerts?.url) {
    updateAlerts();
  } else {
    jQuery('#alerts-loading-message').text('No alerts feed configured.').show();
  }
});
