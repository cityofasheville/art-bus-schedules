# Timetable Page — Data in the DOM

---

## The Pattern

Rather than making separate API calls, the build bakes structured data directly
into the HTML in two complementary ways:

- **`data-*` attributes** on individual elements — so client-side JS can query, filter,
  and show/hide without knowing anything upfront
- **A single JSON blob** in a `<script>` tag — for richer data (geometry, stop coordinates)
  that would be too verbose for attributes

---

### 1. Timetable Containers (`timetablepage.pug`)

Each timetable variant (direction × day) gets its own `<div>`. All the information
the JS needs to filter them is right there in the attributes — no lookups required.

```pug
each timetable in timetablePage.consolidatedTimetables
  div(
    id=`timetable_id_${timetable.timetable_id}`
    class="timetable"
    data-day-list=timetable.dayList
    data-direction-name=timetable.direction_name
    data-timetable-id=timetable.timetable_id
    data-direction-id=timetable.direction_id
    data-route-id=timetable.route_ids.join('_')
  )
    //- timetable content...
```

The rendered HTML for a single timetable looks like:

```html
<div
  id="timetable_id_3"
  class="timetable"
  data-day-list="Mon-Fri"
  data-direction-name="Northbound"
  data-timetable-id="3"
  data-direction-id="0"
  data-route-id="N1"
></div>
```

---

### 2. Map Containers (`timetablepage.pug`)

Each map is similarly stamped with a `data-direction-id` so the client can match
it to the active timetable selection.

```pug
each timetable in timetablePage.consolidatedTimetables
  div(
    class="coa-timetable-map-container"
    id=`coa_map_container_${timetable.timetable_id}`
    data-direction-id=timetable.direction_id
  )
    include timetable_map.pug
```

Inside `timetable_map.pug`, the map canvas itself gets a matching id the JS
library mounts into:

```pug
.map(id=`map_timetable_id_${timetable.timetable_id}`)
```

The rendered HTML for a single map container looks like:

```html
<div class="coa-timetable-map-container" id="coa_map_container_3" data-direction-id="0">
  <div class="map-container">
    <div id="map_timetable_id_3"></div>
  </div>
</div>
```

---

### 3. Stop Columns in the Timetable Table (`timetable_vertical.pug`)

Each stop gets a `<col>` element with its `stop_id` and whether it's a timepoint.
Client-side JS uses these to highlight the selected stop column and link it to
the map marker — without needing a separate data structure.

```pug
colgroup
  each stop in timetable.stops
    col(
      id=`stop_id_${stop.stop_id}`
      data-stop-id=stop.stop_id
      data-is-timepoint=stop.is_timepoint
    )

thead
  tr
    each stop in timetable.stops
      th(
        class=`stop-header`
        data-is-timepoint=stop.is_timepoint
      )
        //- stop name content...
```

---

### 4. Direction & Schedule Menu (`timetable_menu_route.pug`)

When there are multiple timetables, radio buttons let the user switch between
directions and day lists. Their `value` attributes match the `data-direction-id`
and `data-day-list` values on the timetable containers — so the JS just reads
`input.value` and does a `querySelectorAll` filter.

```pug
//- Direction selector
each timetable in uniqueDirectionTimetables
  label(for=`radio_dir_${timetable.direction_id}`)
    input(type="radio" name="directionId" value=timetable.direction_id)
    span= timetable.direction_name

//- Schedule selector (Mon-Fri / Sat / Sun)
each dayList in timetablePage.dayLists
  label(for=`radio_day_${dayList}`)
    input(type="radio" name="dayList" value=dayList)
    span= dayList
```

---

### 5. Route Geometry for the Map (`timetablepage.pug`)

Stop coordinates and route geometry are too rich for `data-*` attributes, so they're
serialized into a single `<script>` block at the bottom of the page. `createMaps()`
reads these globals on load to initialize every MapLibre map at once.

```pug
script.
  const timetablePageFromServer = !{JSON.stringify(timetablePage)};

  const {
    gtfsRealtimeUrls,
    mapStyleUrl,
    routeData,
    stopData,
    pageData: { routeIds, tripIds, stopIds, geojsons }
  } = !{JSON.stringify(prepareMapData(timetablePage, config))};

  createMaps();
```

`geojsons` contains the GeoJSON LineString for each route direction — everything
MapLibre needs to draw the route line and place stop markers.

---

### The Two-Layer Data Strategy

| Data                                       | How it's embedded                     | Used by                               |
| ------------------------------------------ | ------------------------------------- | ------------------------------------- |
| Timetable identity (direction, day, route) | `data-*` attributes on container divs | JS show/hide filtering on menu change |
| Stop identity                              | `data-stop-id` on `<col>` and `<th>`  | JS column highlight + map↔table sync  |
| Route geometry, stop coordinates           | `JSON.stringify` in `<script>`        | MapLibre map initialisation           |
| Realtime feed URLs                         | `JSON.stringify` in `<script>`        | Live vehicle position polling         |
