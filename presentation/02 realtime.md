# ART Transit Site — Data Flow

---

## Real-time Departures — GTFS Data → Browser

---

### 1. GTFS Data from SQLite (`index.js`)

The build queries the SQLite database and attaches everything to `config.timetablePage`. This is the same object passed to every template.

```js
const stops = db.prepare('SELECT * FROM stops').all();
const routes = db.prepare('SELECT * FROM routes').all();
const trips = db.prepare('SELECT * FROM trips').all();
const directions = db.prepare('SELECT * FROM directions').all();
const stopTimes = db
  .prepare('SELECT trip_id, stop_id, stop_sequence FROM stop_times ORDER BY trip_id, stop_sequence')
  .all();

config.timetablePage = { stops, routes, trips, directions, stopTimes };
```

---

### 2. Server-side Data Preparation (`server_computed_data.pug`)

At render time, Pug transforms the flat GTFS arrays into useful lookup structures, then serializes them directly into `<script>` tags with `JSON.stringify`. The client never makes a separate API call for this data — it's baked into the HTML.

```pug
//- Build a stop lookup: { stop_id -> { stop_id, stop_name, stop_code } }
- var stopLookup = {};
- config.timetablePage.stops.forEach(stop => {
-   stopLookup[stop.stop_id] = { stop_id: stop.stop_id, stop_name: stop.stop_name, stop_code: stop.stop_code };
- });

//- Build a route+direction -> stops mapping by walking stop_times
- var routeDirectionStops = {};
- config.timetablePage.stopTimes.forEach(st => {
-   var trip = tripLookup[st.trip_id];
-   var key  = trip.route_id + '_' + trip.direction_id;
-   if (!routeDirectionStops[key]) routeDirectionStops[key] = [];
-   var stopInfo = stopLookup[st.stop_id];
-   if (stopInfo && !routeDirectionStops[key].some(s => s.stop_id === st.stop_id))
-     routeDirectionStops[key].push(stopInfo);
- });

//- Alphabetical stop list for the "search by stop" dropdown
- var alphabetical_stops = [...config.timetablePage.stops].sort((a, b) =>
-   a.stop_name.localeCompare(b.stop_name)
- );

//- Serialize everything into the page as JS constants
script.
  const routeDirectionStops = !{JSON.stringify(routeDirectionStops)};
  const stopData             = !{JSON.stringify(stopData)};
  const routeData            = !{JSON.stringify(routeData)};
  const gtfsRealtimeUrls     = !{JSON.stringify(gtfsRealtimeUrls)};
```

The `!{ }` syntax is Pug's unescaped interpolation — it writes the raw JSON string directly into the script block.

---

### 3. Using the Data in the Widget Template (`realtimedepartures_widget.pug`)

The server-computed `alphabetical_stops` variable is available immediately — it was built in the same render pass. The route/direction dropdowns are populated client-side from the `routeDirectionStops` constant.

```pug
//- "By Stop" tab: server renders every option at build time
select(id="stop-select-dropdown")
  option(value="") Select a stop
  each stop in alphabetical_stops
    option(value=stop.stop_id)= `${stop.stop_name} (${stop.stop_code})`

//- "By Route" tab: dropdowns start empty; client-side JS fills them
//- using the routeDirectionStops constant that was JSON-serialized above
select(id="route-select-dropdown")
  option(value="") Select a route

select(id="direction-select-dropdown" disabled)
  option(value="") Select a direction

select(id="stop-by-route-select-dropdown" disabled)
  option(value="") Select a stop
```

---

### 4. The Data Flow for Real-time Departures

| Step | Where                                   | What happens                                                                                        |
| ---- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1    | `index.js` (build)                      | GTFS feed is downloaded and imported into SQLite                                                    |
| 2    | `index.js` (build)                      | Stops, routes, trips, and stop times are queried and attached to `config.timetablePage`             |
| 3    | `server_computed_data.pug` (build)      | Flat arrays are transformed into lookup maps (`stopData`, `routeData`, `routeDirectionStops`)       |
| 4    | `server_computed_data.pug` (build)      | Lookup maps are serialized via `JSON.stringify` into `<script>` tags — baked directly into the HTML |
| 5    | `realtimedepartures_widget.pug` (build) | Stop dropdown options are rendered server-side from `alphabetical_stops`                            |
| 6    | `realtime-departures.js` (client)       | On stop selection, the live GTFS Realtime feed is fetched and decoded                               |
| 7    | `realtime-departures.js` (client)       | Departures are enriched with route/stop names from the baked-in constants and rendered              |
