/* global jQuery, anchorme, Pbf, stopData, routeData, routeIds, tripIds, stopIds, gtfsRealtimeUrls */
/* eslint no-var: "off", prefer-arrow-callback: "off", no-unused-vars: "off" */

let gtfsRealtimeAlertsInterval;
// const all_routes = window.config.timetablePage.routes;
// const all_route_ids = window.config.timetablePage.routes.map((route) => route.route_id);
// const all_stops = window.config.timetablePage.stops;
// const all_stop_ids = window.config.timetablePage.stops.map((stop) => stop.stop_id);

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

function formatAlertAsHtml(alert, affectedRouteIdsInTimetable, affectedStopsIdsInTimetable) {
  console.log('Formatting alert:', alert);

  const $alert = jQuery('<div>').addClass('timetable-alert');

  const $routeList = jQuery('<div>').addClass('route-list');

  for (const routeId of affectedRouteIdsInTimetable) {
    const route = routeData[routeId];

    if (!route) {
      continue;
    }

    jQuery('<div>')
      .addClass('route-color-swatch')
      .css('background-color', route.route_color || '#000000')
      .css('color', route.route_text_color || '#FFFFFF')
      .text(route.route_short_name)
      .appendTo($routeList);
  }

  const $alertHeader = jQuery('<div>')
    .addClass('alert-header')
    .append($routeList)
    .append(
      jQuery('<div>').addClass('alert-title').text(alert.alert.header_text.translation[0].text)
    );

  // Use anchorme to convert URLs to clickable links while using jQuery .text to prevent XSS
  const $alertBody = jQuery('<div>')
    .addClass('alert-body')
    .append(
      anchorme(
        jQuery('<div>')
          .addClass('alert-body')
          .text(`${alert.alert.description_text.translation[0].text} `)
          .html()
      )
    );

  if (alert.alert.url?.translation?.[0].text) {
    jQuery('<a>')
      .attr('href', alert.alert.url.translation[0].text)
      // .addClass('btn-blue btn-sm alert-more-info')
      .addClass('alert-more-info text-link')
      .text('More Info')
      .appendTo($alertBody);
  }

  if (affectedStopsIdsInTimetable.length > 0) {
    const $stopList = jQuery('<ul>').addClass('list-disc pl-4 mt-2');

    for (const stopId of affectedStopsIdsInTimetable) {
      const stop = stopData[stopId];

      if (!stop) {
        continue;
      }

      jQuery('<li>')
        .addClass('my-2')
        .append(jQuery('<div>').addClass('stop-name').text(stop.stop_name))
        .appendTo($stopList);
    }

    jQuery('<div>')
      .addClass('mt-4 border-b border-gray-300 font-semibold pb-2')
      .text('Stops Affected:')
      .append($stopList)
      .appendTo($alertBody);

    $stopList.appendTo($alertBody);
  }

  $alertHeader.appendTo($alert);
  $alertBody.appendTo($alert);

  return $alert;
}

async function updateAlerts() {
  console.log('Updating GTFS-Realtime alerts', gtfsRealtimeUrls);
  if (!gtfsRealtimeUrls?.realtimeAlerts) {
    return;
  }

  try {
    const alerts = await fetchGtfsRealtime(
      gtfsRealtimeUrls.realtimeAlerts.url,
      gtfsRealtimeUrls.realtimeAlerts.headers
    );

    if (!alerts) {
      $('#timetable_alert_count').removeClass('border-red-600').text('').hide();
      return;
    }

    let relevant_alert_data = [];
    const formattedAlerts = [];

    for (const alert of alerts) {
      if (!alert.alert || alert.alert.is_deleted) {
        continue;
      }
      relevant_alert_data.push({
        id: alert.id,
        title: alert.alert.header_text.translation[0].text,
        description: alert.alert.description_text.translation[0].text,
        routes_affected: [
          ...alert.alert.informed_entity
            .filter((entity) => entity.route_id !== undefined && entity.route_id !== '')
            .map((entity) => routeData[entity.route_id]),
        ],
        stops_affected: [
          ...alert.alert.informed_entity
            .filter((entity) => entity.stop_id !== undefined && entity.stop_id !== '')
            .map((entity) => stopData[entity.stop_id]),
        ],
        valid_timespans: alert.alert.active_period,
      });

      const affectedRouteIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter((entity) => entity.route_id !== undefined && entity.route_id !== '')
            .map((entity) => entity.route_id),
        ]),
      ];

      const affectedRouteIdsInTimetable = routeIds.filter((routeId) =>
        affectedRouteIds.includes(routeId)
      );

      const affectedStopIds = [
        ...new Set([
          ...alert.alert.informed_entity
            .filter((entity) => entity.stop_id !== undefined && entity.stop_id !== '')
            .map((entity) => entity.stop_id),
        ]),
      ];

      const affectedStopsIdsInTimetable = stopIds.filter((stopId) =>
        affectedStopIds.includes(stopId)
      );

      // Hide alerts that don't affect any stops or routes in this timetable
      if (affectedStopsIdsInTimetable.length === 0 && affectedRouteIdsInTimetable.length === 0) {
        continue;
      }

      try {
        // formattedAlerts.push(
        //   formatAlertAsHtml(alert, affectedRouteIdsInTimetable, affectedStopsIdsInTimetable)
        // );
      } catch (error) {
        console.error(error);
      }
    }

    console.log('Processed alerts:', relevant_alert_data);

    const routeGroups = {};
    const systemWide = [];

    relevant_alert_data.forEach((alert) => {
      if (alert.routes_affected && alert.routes_affected.length > 0) {
        alert.routes_affected.forEach((route) => {
          if (!routeGroups[route.route_id]) {
            routeGroups[route.route_id] = [];
          }
          if (!routeGroups[route.route_id].some((a) => a.id === alert.id)) {
            routeGroups[route.route_id].push(alert);
          }
        });
      } else {
        systemWide.push(alert);
      }
    });

    $('#alerts-container').empty();

    if (systemWide.length > 0) {
      $('#alerts-container').append('<h3 class="mt-4 border-t-2">System-wide Alerts</h3>');
      systemWide.forEach((alert) => {
        $('#alerts-container').append(
          `<div class="p-2 my-4 border alert system-wide"><div class="block text-xl mb-2">${alert.title}:</div> ${alert.description}</div>`
        );
      });
    }

    Object.keys(routeGroups).forEach((route_id) => {
      // $('#alerts-container').append(
      //   `<h3 class="mt-4 border-t-2">Alerts for Route ${routeData[route_id].route_short_name}</h3>`
      // );
      routeGroups[route_id].forEach((alert) => {
        let affected_stops_html = '';
        if (alert.stops_affected && alert.stops_affected.length > 0) {
          affected_stops_html =
            '<div class="mt-4 border-b border-gray-300 font-semibold pb-2">Stops Affected</div><ul class="list-disc pl-4 mt-2">';
          alert.stops_affected.forEach((stop) => {
            affected_stops_html += `<li class="my-2"><div class="stop-name">${stop.stop_name}</div></li>`;
          });
          affected_stops_html += '</ul>';
        }
        $('#alerts-container').append(
          `<details class="bg-aux-gray border border-slate-300 rounded mb-6">
          <summary class="list-none flex gap-4 align-middle justify-between py-2 px-4 cursor-pointer">
          <div class="flex items-center text-art-blue gap-2 text-lg font-semibold">
          <span class="route-color-swatch" style="background-color: #${routeData[route_id].route_color};color: #${routeData[route_id].route_text_color};">${routeData[route_id].route_short_name}</span>
          <span>${alert.title}</span>
          </div>
          <div class="flex items-center">
          <span class="bi bi-chevron-down justify-self-end text-xl" aria-hidden="true"></span>
          </div>
          </summary>
          <div class="p-4 border-t border-slate-300">
          <p>${alert.description}</p>
          ${affected_stops_html}
          </div>
         </details>`
        );
      });
    });

    // Remove previously posted GTFS-RT alerts
    jQuery('.timetable-alerts-list .timetable-alert').remove();

    $('#timetable_alert_count').removeClass('border-red-600').text('').hide();

    if (formattedAlerts.length > 0) {
      $('#timetable_alert_count').addClass('border-red-600').text(formattedAlerts.length).show();
      // Remove the empty message if present
      jQuery('.timetable-alert-empty').hide();

      for (const alert of formattedAlerts) {
        jQuery('.timetable-alerts-list').append(alert);
      }
    } else {
      // Replace the empty message if present
      jQuery('.timetable-alert-empty').show();
    }
  } catch (error) {
    console.error(error);
  }
}

jQuery(() => {
  console.log('Home Alerts JS loaded', gtfsRealtimeUrls);

  $('#timetable_alert_count').removeClass('border-red-600').text('').hide();
  if (gtfsRealtimeUrls?.realtimeAlerts?.url) {
    // console.log('Starting GTFS-Realtime alerts update interval');
    // const alertUpdateInterval = 60 * 1000; // Every Minute
    updateAlerts();
    // gtfsRealtimeAlertsInterval = setInterval(() => {
    //   updateAlerts();
    // }, alertUpdateInterval);
  }
});
