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
  console.log('Formatting alert:', alert);

  const $alert = jQuery('<article>').addClass('timetable-alert').attr('role', 'alert');

  const $routeList = jQuery('<ul>').addClass('route-list flex gap-1 list-none p-0 m-0');

  for (const routeId of affectedRouteIdsInTimetable) {
    const route = routeData[routeId];

    if (!route) {
      continue;
    }

    jQuery('<li>')
      .addClass('route-color-swatch-large')
      .css('background-color', route.route_color || '#000000')
      .css('color', route.route_text_color || '#FFFFFF')
      .attr('title', route.route_long_name || `Route ${route.route_short_name}`)
      .text(route.route_short_name)
      .appendTo($routeList);
  }

  // Status badge for active vs upcoming
  const $statusBadge = isCurrentlyActive
    ? jQuery('<span>')
        .addClass(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800',
        )
        .attr('aria-label', 'Currently active')
        .text('Active')
    : jQuery('<span>')
        .addClass(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800',
        )
        .attr('aria-label', 'Upcoming alert')
        .text('Upcoming');

  const $alertTitle = jQuery('<h3>')
    .addClass('alert-title text-lg font-semibold m-0')
    .text(alert.alert.header_text.translation[0].text);

  // Build timespan text from active_period
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

  // Build datetime attribute for <time> element
  const firstTimespan = timespans[0];
  const datetimeAttr = firstTimespan?.start
    ? new Date(firstTimespan.start * 1000).toISOString()
    : '';

  const $timeElement = jQuery('<time>')
    .addClass('text-sm text-gray-600')
    .attr('datetime', datetimeAttr)
    .text(timespanText);

  // Row 1: Route swatch + title
  const $alertRow1 = jQuery('<div>')
    .addClass('flex items-center gap-3')
    .append($routeList)
    .append($alertTitle);

  // Row 2: Status badge + timespan
  const $alertRow2 = jQuery('<div>')
    .addClass('flex items-center gap-2 mt-1')
    .append($timeElement)
    .append($statusBadge);

  const $alertHeader = jQuery('<header>')
    .addClass('flex flex-col gap-2 border-b border-gray-300 pb-2')
    .append($alertRow1)
    .append($alertRow2);

  // Use anchorme to convert URLs to clickable links while using jQuery .text to prevent XSS
  const descriptionHtml = anchorme(
    jQuery('<span>').text(`${alert.alert.description_text.translation[0].text} `).html(),
  );

  const $alertBody = jQuery('<div>').addClass('alert-body');

  const $description = jQuery('<p>').addClass('my-2').html(descriptionHtml);

  $description.appendTo($alertBody);

  if (alert.alert.url?.translation?.[0].text) {
    jQuery('<a>')
      .attr('href', alert.alert.url.translation[0].text)
      .addClass('alert-more-info text-link')
      .text('More Info')
      .appendTo($alertBody);
  }

  if (affectedStopsIdsInTimetable.length > 0) {
    const $stopsSection = jQuery('<aside>').addClass('mt-4 pt-2 border-t border-gray-300');

    jQuery('<h4>').addClass('font-semibold mb-2').text('Stops Affected:').appendTo($stopsSection);

    const $stopList = jQuery('<ul>').addClass('list-disc pl-4');

    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];

      if (!stop) {
        continue;
      }

      jQuery('<li>').addClass('my-1').text(stop.stop_name).appendTo($stopList);
    }

    $stopList.appendTo($stopsSection);
    $stopsSection.appendTo($alertBody);
  }

  $alertHeader.appendTo($alert);
  $alertBody.appendTo($alert);

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
      $('#timetable_alert_count').removeClass('border-red-600 border-4').text('').hide();
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
    jQuery('.timetable-alerts-list .timetable-alert').remove();

    $('#timetable_alert_count').removeClass('border-red-600 border-4').text('').hide();

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

      $('#timetable_alert_count').addClass('border-red-600 border-4').text(statusText).show();
      // Remove the empty message if present
      jQuery('.timetable-alert-empty').hide();

      for (const alert of formattedAlerts) {
        jQuery('.timetable-alerts-list').append(alert.element);
      }
    } else {
      // Show "No alerts" status and empty message
      $('#timetable_alert_count').removeClass('border-red-600 border-4').text('No alerts').show();
      jQuery('.timetable-alert-empty').show();
    }
  } catch (error) {
    console.error(error);
  }
}

jQuery(() => {
  console.log('Timetable Alerts JS loaded', gtfsRealtimeUrls);
  // $('#timetable_alert_count').removeClass('border-red-600 border-4').text('No alerts').show();
  if (!gtfsRealtimeAlertsInterval && gtfsRealtimeUrls?.realtimeAlerts?.url) {
    const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    gtfsRealtimeAlertsInterval = setInterval(() => {
      updateAlerts();
    }, alertUpdateInterval);
  }
});
