# ART Transit Site — Data Flow

## WordPress → Build → Browser

---

### 1. Fetching Content from WordPress (`wordpress.js`)

Each page's content is declared as a simple config entry. All endpoints are fetched in parallel, and the HTML is sanitized before it ever touches the build.

```js
// Each page maps to a WordPress REST API endpoint
const WP_ENDPOINTS = [
  { key: 'ada', path: '/services/494?_fields=title,content' },
  { key: 'howToRide', path: '/services/468?_fields=title,content' },
  { key: 'faresAndPasses', path: '/services/424?_fields=title,content' },
  // ...one entry per page
];

export async function getWordPressData() {
  // Fetch all pages in parallel
  const responses = await Promise.all(WP_ENDPOINTS.map(({ path }) => fetch(`${WP_BASE}${path}`)));

  const payloads = await Promise.all(responses.map((res) => res.json()));

  // Sanitize and key the results
  const wordpressData = {};
  payloads.forEach((payload, i) => {
    const { key } = WP_ENDPOINTS[i];
    wordpressData[key] = {
      title: { rendered: sanitizeHtml(payload.title.rendered) },
      content: { rendered: sanitizeHtml(payload.content.rendered, SANITIZE_OPTIONS) },
    };
  });

  return wordpressData;
}
```

---

### 2. Assembling the Build Config (`index.js`)

WordPress content and GTFS transit data are merged into a single `config` object that gets passed to every pug template.

Each entry in `config.customPages` declares a template, an output path, and a title:

```json
"customPages": [
  {
    "template": "ada_full.pug",
    "output":   "ada/index.html",
    "title":    "ADA, Wheelchairs and Service Animals"
  },
  {
    "template": "realtimedepartures_full.pug",
    "output":   "real-time-departures/index.html",
    "title":    "Real-time Departures"
  }
]
```

The build iterates over every entry and renders it:

```js
async function build() {
  const config = JSON.parse(await fs.readFile('config.json'));

  config.wordpress = await getWordPressData();

  // ... GTFS data processing logic

  for (const page of config.customPages) {
    const html = pug.renderFile(page.template, { config });
    await fs.writeFile(page.output, html);
  }
}
```

---

### 3. The Page Template (`ada_full.pug` + `ada.pug`)

Templates extend a shared layout and drop WordPress content directly into the page. No client-side fetching — the page markup is already in the pug-generated html file.

```pug
//- ada_full.pug (for example)
extends layout

block content
  include ada.pug

block append extraHeader
  script(src='/js/heading-normalize.js')
```

```pug
//- ada.pug — renders the WordPress content
include page_heading
+page_heading(config.wordpress.ada.title.rendered)

div.entry-content
  div!= config.wordpress.ada.content.rendered
```

---

### The Shape of `config.wordpress`

What arrives in every template after the build:

```js
config.wordpress = {
  ada: {
    title: { rendered: 'ADA / Paratransit' },
    content: { rendered: '<p>ART is committed to...</p><h2>How to Request...</h2>' },
  },
  howToRide: {
    title: { rendered: 'How to Ride ART' },
    content: { rendered: '<p>...</p>' },
  },
  // one key per page
};
```
