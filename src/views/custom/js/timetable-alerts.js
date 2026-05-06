/* global jQuery, anchorme, Pbf, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

let gtfsRealtimeAlertsInterval;

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

function formatAlertAsHtml(
  alert,
  affectedRouteIdsInTimetable,
  affectedStopsIdsInTimetable,
  isCurrentlyActive,
) {
  const $alert = jQuery('<li>').addClass(
    'timetable-alert bg-white border border-slate-300 rounded border-l-4 border-l-aux-red p-4',
  );

  // Route swatches
  let routeSwatchesHtml = '<ul class="flex flex-wrap gap-1 list-none p-0 m-0 mb-2">';
  if (affectedRouteIdsInTimetable.length > 0) {
    for (const routeId of affectedRouteIdsInTimetable) {
      const route = routeData[routeId];
      if (!route) continue;
      routeSwatchesHtml += `<li class="route-color-swatch" style="background-color: ${route.route_color || '#000000'}; color: ${route.route_text_color || '#FFFFFF'};" title="${route.route_long_name || 'Route ' + route.route_short_name}" aria-label="${route.route_long_name || 'Route ' + route.route_short_name}">${route.route_short_name}</li>`;
    }
  }
  routeSwatchesHtml += '</ul>';

  // Status badge
  const statusBadge = isCurrentlyActive
    ? '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" aria-label="Currently active">Active</span>'
    : '<span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800" aria-label="Upcoming alert">Upcoming</span>';

  // Build timespan text
  const timespans = alert.alert.active_period || [];
  const timespanText =
    timespans.length > 0
      ? timespans
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
          .join(', ')
      : 'Ongoing';

  // Title
  const title = jQuery('<span>').text(alert.alert.header_text.translation[0].text).html();

  // Description (XSS-safe via .text then anchorme for links)
  const descriptionHtml = anchorme(
    jQuery('<span>').text(alert.alert.description_text.translation[0].text).html(),
  );

  // Affected stops
  let affectedStopsHtml = '';
  if (affectedStopsIdsInTimetable.length > 0) {
    affectedStopsHtml =
      '<div class="mt-3 border-t border-gray-300 pt-2"><span class="font-semibold">Stops Affected:</span><ul class="list-disc pl-4 mt-1">';
    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];
      if (!stop) continue;
      affectedStopsHtml += `<li class="my-1">${jQuery('<span>').text(stop.stop_name).html()}</li>`;
    }
    affectedStopsHtml += '</ul></div>';
  }

  // More info link
  const moreInfoHtml = alert.alert.url?.translation?.[0]?.text
    ? `<a href="${alert.alert.url.translation[0].text}" class="text-link underline hover:no-underline">More Info</a>`
    : '';

  $alert.html(`
    <div class="flex flex-col gap-1">
      ${routeSwatchesHtml}
      <div class="text-lg font-medium">${title}</div>
      <div class="text-sm text-gray-600">${timespanText}</div>
      <div>${statusBadge}</div>
    </div>
    <div class="mt-3 text-sm">
      <p class="my-1">${descriptionHtml}</p>
      ${moreInfoHtml}
      ${affectedStopsHtml}
    </div>
  `);

  return $alert;
}

async function updateAlerts() {
  if (!gtfsRealtimeUrls?.realtimeAlerts) {
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
      $('#timetable_alert_count').removeClass('border-red-600').text('').hide();
      return;
    }

    // Filter to alerts that are active now or starting within the next 2 weeks
    const active_alerts = alerts.filter((alert) => {
      if (!alert.alert || alert.alert.is_deleted) {
        return false;
      }
      const timespans = alert.alert.active_period;
      if (!timespans || timespans.length === 0) {
        // No timespan means always active
        return true;
      }
      for (const timespan of timespans) {
        if (
          (!timespan.start || timespan.start <= two_weeks_from_now) &&
          (!timespan.end || timespan.end >= current_timestamp)
        ) {
          return true;
        }
      }
      return false;
    });

    const formattedAlerts = [];

    for (const alert of active_alerts) {
      const affectedRouteIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter((entity) => entity.route_id !== undefined && entity.route_id !== '')
            .map((entity) => entity.route_id),
        ]),
      ];

      const affectedRouteIdsInTimetable = routeIds.filter((routeId) =>
        affectedRouteIds.includes(routeId),
      );

      const affectedStopIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter((entity) => entity.stop_id !== undefined && entity.stop_id !== '')
            .map((entity) => entity.stop_id),
        ]),
      ];

      const affectedStopsIdsInTimetable = stopIds.filter((stopId) =>
        affectedStopIds.includes(stopId),
      );

      // Determine if this alert should show on this route page:
      // - If alert specifies route_ids, only show if this route is in the list
      // - If alert has no route_ids (system-wide/stop-only), show if it affects stops on this route
      const alertHasRouteIds = affectedRouteIds.length > 0;

      if (alertHasRouteIds) {
        // Alert is route-specific - only show if this route is affected
        if (affectedRouteIdsInTimetable.length === 0) {
          continue;
        }
      } else {
        // Alert is system-wide or stop-only - show if it affects stops on this route
        if (affectedStopsIdsInTimetable.length === 0) {
          continue;
        }
      }

      // Determine if alert is currently active vs upcoming
      const timespans = alert.alert.active_period || [];
      const isCurrentlyActive =
        timespans.length === 0 ||
        timespans.some((timespan) => {
          // Alert is active if it has no start time OR start time is in the past/present
          return !timespan.start || timespan.start <= current_timestamp;
        });

      try {
        formattedAlerts.push({
          element: formatAlertAsHtml(
            alert,
            affectedRouteIdsInTimetable,
            affectedStopsIdsInTimetable,
            isCurrentlyActive,
          ),
          isCurrentlyActive,
        });
      } catch (error) {
        console.error(error);
      }
    }

    // Remove previously posted GTFS-RT alerts
    jQuery('.timetable-alerts-list').empty().addClass('hidden');
    jQuery('.timetable-alert-empty').removeClass('hidden');

    $('#timetable_alert_count').removeClass('border-red-600').text('').hide();

    if (formattedAlerts.length > 0) {
      // Count active vs upcoming
      const activeCount = formattedAlerts.filter((a) => a.isCurrentlyActive).length;
      const upcomingCount = formattedAlerts.filter((a) => !a.isCurrentlyActive).length;

      // Build status text
      const statusParts = [];
      if (activeCount > 0) {
        statusParts.push(`${activeCount} active`);
      }
      if (upcomingCount > 0) {
        statusParts.push(`${upcomingCount} upcoming`);
      }
      const statusText = statusParts.join(', ');

      $('#timetable_alert_count').addClass('border-red-600').text(statusText).show();

      const $list = jQuery('<ul>').addClass('list-none p-0 m-0 flex flex-col gap-4');
      for (const alert of formattedAlerts) {
        $list.append(alert.element);
      }
      jQuery('.timetable-alert-empty').addClass('hidden');
      jQuery('.timetable-alerts-list').append($list).removeClass('hidden');
    } else {
      // Show "No alerts" status and empty message
      $('#timetable_alert_count').removeClass('border-red-600').text('No alerts').show();
    }
  } catch (error) {
    console.error(error);
  }
}

jQuery(() => {
  if (!gtfsRealtimeAlertsInterval && gtfsRealtimeUrls?.realtimeAlerts?.url) {
    const alertUpdateInterval = 60 * 1000;
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
});
