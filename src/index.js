import { importGtfs } from 'gtfs';
import gtfsToHtml from 'gtfs-to-html';
import pug from 'pug';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import sanitizeHtml from 'sanitize-html';

const sanitizeOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'iframe']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title'],
    th: ['scope', 'colspan', 'rowspan'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
};

function runQuery(db, query) {
  const prep = db.prepare(query);
  const result = prep.run();
  return result;
}

async function processFiles({
  sourceFolder = null,
  defaultMapPagePath = null,
  customHomePagePath = null,
  systemMapPagePath = null,
} = {}) {
  if (!sourceFolder) {
    console.error('No source folder provided for processing.');
    return;
  }

  try {
    const files = await fs.readdir(sourceFolder);

    for (const file of files) {
      const filePath = path.join(sourceFolder, file);
      const stats = await fs.stat(filePath);

      console.log('Processing file:', filePath);

      if (stats.isFile()) {
        const fileBaseName = path.parse(file).name;
        const newFolderName = path.join(sourceFolder, '..', fileBaseName);
        const newFilePath = path.join(newFolderName, 'index.html');

        // Create the new folder if it doesn't exist
        await fs.mkdir(newFolderName, { recursive: true });

        // Move and rename the file
        await fs.rename(filePath, newFilePath);

        console.log(`Processed: ${file} -> ${newFilePath}`);
      }
    }

    if (defaultMapPagePath) {
      const mapSrc = path.join(defaultMapPagePath, 'index.html');
      const mapDestDir = systemMapPagePath;
      const mapDest = path.join(mapDestDir, 'index.html');
      await fs.mkdir(mapDestDir, { recursive: true });
      await fs.rename(mapSrc, mapDest);
      console.log(`Moved map page: ${mapSrc} -> ${mapDest}`);
    }

    if (customHomePagePath) {
      const customHomeSrc = path.join(customHomePagePath, 'index.html');
      const customHomeDest = path.join(defaultMapPagePath, 'index.html');
      await fs.rename(customHomeSrc, customHomeDest);
      console.log(`Moved custom home page: ${customHomeSrc} -> ${customHomeDest}`);
    }

    console.log('File processing complete.');
  } catch (err) {
    console.error('An error occurred:', err);
  }
}

const WP_BASE = 'https://www.ashevillenc.gov/wp-json/wp/v2';

/**
 * Maps a standard WordPress page payload to a sanitized { content, title } shape.
 * Body content allows the extended tag set (images, YouTube iframes); titles use the defaults.
 */
function sanitizePage(data) {
  return {
    content: { rendered: sanitizeHtml(data.content.rendered, sanitizeOptions) },
    title: { rendered: sanitizeHtml(data.title.rendered) },
  };
}

/**
 * WordPress endpoints to pull content from, in fetch order. Each entry maps one
 * API response into the returned data object:
 *   - `key`   assigns the sanitized page to returnedData[key] (the default behavior).
 *   - `apply` is a custom handler for responses that don't fit the standard shape.
 * `label` is used only for error messages.
 */
const WP_ENDPOINTS = [
  { key: 'howToRide', label: 'How to Ride', path: '/services/468?_fields=title,content' },
  { key: 'reportIssues', label: 'Report Issues', path: '/services/492?_fields=title,content' },
  { key: 'faresAndPasses', label: 'Fares and Passes', path: '/services/424?_fields=title,content' },
  {
    label: 'Transit Homepage',
    path: '/departments/861?_fields=title,content,acf',
    apply: (data, out) => {
      out.transitConnect = data.acf;
      out.transitAbout = sanitizePage(data);
    },
  },
  { key: 'holidays', label: 'Holidays', path: '/departments/141640?_fields=title,content' },
  { key: 'ada', label: 'ADA', path: '/services/494?_fields=title,content' },
  { key: 'bikesOnBuses', label: 'Bikes on Buses', path: '/services/481?_fields=title,content' },
  { key: 'wifiTerms', label: 'Wi-Fi Terms', path: '/departments/92483?_fields=title,content' },
  { key: 'wifiFaqs', label: 'Wi-Fi FAQs', path: '/departments/93145?_fields=title,content' },
  { key: 'passport', label: 'Passport', path: '/departments/99420?_fields=title,content' },
  {
    key: 'policiesAndTips',
    label: 'Policies and Tips',
    path: '/services/488?_fields=title,content',
  },
  {
    label: 'Transit News',
    path: '/posts?avl_department=64&per_page=3&orderby=date&order=desc&_fields=id,title,excerpt,date,link,featured_media,_links&_embed=wp:featuredmedia',
    apply: (data, out) => {
      out.transitNews = data.map((post) => ({
        ...post,
        title: { ...post.title, rendered: sanitizeHtml(post.title.rendered) },
        excerpt: {
          ...post.excerpt,
          rendered: sanitizeHtml(post.excerpt.rendered, sanitizeOptions),
        },
      }));
    },
  },
];

/**
 * Fetches content from the WordPress API
 */
async function getWordPressData() {
  try {
    const responses = await Promise.all(
      WP_ENDPOINTS.map((endpoint) => fetch(`${WP_BASE}${endpoint.path}`)),
    );

    responses.forEach((response, i) => {
      if (!response.ok) {
        throw new Error(`HTTP error fetching ${WP_ENDPOINTS[i].label}! status: ${response.status}`);
      }
    });

    const payloads = await Promise.all(responses.map((response) => response.json()));

    const returnedData = {};
    payloads.forEach((payload, i) => {
      const endpoint = WP_ENDPOINTS[i];
      if (endpoint.apply) {
        endpoint.apply(payload, returnedData);
      } else {
        returnedData[endpoint.key] = sanitizePage(payload);
      }
    });

    return returnedData;
  } catch (error) {
    console.error('Failed to fetch data from WordPress API:', error.message);
    throw error;
  }
}

const insertTimetablesQuery = `INSERT INTO timetables
                SELECT ROW_NUMBER() OVER (ORDER BY route_id,direction_id,service_description) AS timetable_id
                      ,ttbls.route_id,ttbls.direction_id,ttbls.start_date,ttbls.end_date,ttbls.monday,ttbls.tuesday,ttbls.wednesday,ttbls.thursday
                      ,ttbls.friday,ttbls.saturday,ttbls.sunday,ttbls.start_time,ttbls.start_timestamp,ttbls.end_time,ttbls.end_timestamp
                      ,ttbls.timetable_label,ttbls.service_notes,ttbls.orientation,ttbls.timetable_page_id,ttbls.timetable_sequence,ttbls.direction_name
                      ,ttbls.include_exceptions,ttbls.show_trip_continuation
                FROM
                    (
                      SELECT DISTINCT ca.service_description,r.route_id,d.direction_id,c.start_date,c.end_date,c.monday,c.tuesday,c.wednesday,c.thursday
                                    ,c.friday,c.saturday,c.sunday,NULL AS start_time,NULL AS start_timestamp,NULL AS end_time,NULL AS end_timestamp
                                    ,d.direction AS timetable_label
                                    ,NULL AS service_notes
                                    ,'vertical' AS orientation
                                    ,r.route_short_name AS timetable_page_id
                                    ,NULL AS timetable_sequence
                                    ,d.direction AS direction_name
                                    ,NULL AS include_exceptions
                                    ,NULL AS show_trip_continuation
                      FROM        trips AS t
                      LEFT JOIN   routes AS r ON r.route_id=t.route_id
                      LEFT JOIN   directions AS d ON d.route_id=t.route_id AND d.direction_id=t.direction_id
                      INNER JOIN  calendar AS c ON c.service_id=t.service_id
                      INNER JOIN  calendar_attributes ca ON ca.service_id =c.service_id
                      WHERE (SELECT MAX(start_date) FROM calendar WHERE strftime('%Y%m%d', 'now') BETWEEN start_date AND end_date) = c.start_date  
                    ) ttbls`;
const insertTimetablePagesQuery = `INSERT INTO timetable_pages (timetable_page_id)
                SELECT DISTINCT route_short_name
                FROM routes`;
const activePeriodQuery = `SELECT DISTINCT CONCAT(c.start_date,'-',c.end_date) AS relativePath
                FROM calendar c
                WHERE (SELECT MAX(start_date) FROM calendar WHERE strftime('%Y%m%d', 'now') BETWEEN start_date AND end_date) = c.start_date`;

// Working directory for the imported GTFS SQLite database; wiped before and after each build.
const TMP_DIR = './src/tmp';

// Static files copied verbatim from the template dir into the build output.
const STATIC_ASSETS = [
  'favicon.ico',
  'art-logo-blue-small.png',
  'art-logo-blue-small-text-under.png',
  'art-logo-white-small.png',
  'art-logo-green-small.png',
  'art-connect-icon.svg',
  'art-logo-white-no-text.png',
];

async function main() {
  const config = JSON.parse(await fs.readFile(new URL('../config.json', import.meta.url)));
  const url = config.agencies[0].url;
  const dbPath = config.sqlitePath;
  const templatePath = config.templatePath;
  const buildPath = config.outputPath;
  config.wordpress = await getWordPressData();
  config.logo_url = '/art-logo-blue-small.png';
  config.logo_url_mobile = '/art-logo-blue-small-text-under.png';
  config.footer_logo_url = '/art-logo-white-no-text.png';
  config.connect_icon_url = '/art-connect-icon.svg';
  config.webpageTitle = 'ART Transit System';

  await fs.rm(TMP_DIR, { recursive: true, force: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
  const db = new Database(dbPath);

  try {
    await importGtfs({
      agencies: [
        {
          url: url,
        },
      ],
      sqlitePath: dbPath,
    });

    const ttableResult = runQuery(db, insertTimetablesQuery);
    const ttablePagesResult = runQuery(db, insertTimetablePagesQuery);
    const folderPath = db.prepare(activePeriodQuery).get();

    const stops = db.prepare('SELECT * FROM stops').all();
    const routes = db.prepare('SELECT * FROM routes').all();
    const timetables = db.prepare('SELECT * FROM timetables').all();
    const trips = db.prepare('SELECT * FROM trips').all();
    const directions = db.prepare('SELECT * FROM directions').all();
    const stopTimes = db
      .prepare(
        'SELECT trip_id, stop_id, stop_sequence FROM stop_times ORDER BY trip_id, stop_sequence',
      )
      .all();
    const holidayDates = db
      .prepare('SELECT DISTINCT date FROM calendar_dates ORDER BY date')
      .all()
      .map((row) => row.date);

    config.holidayDates = holidayDates;

    console.log('Routes fetched:', routes.length);

    const timetablePage = {
      consolidatedTimetables: timetables,
      stops,
      routes,
      trips,
      directions,
      stopTimes,
    };

    config.timetablePage = timetablePage;

    console.log('Timetables inserted', ttableResult.changes);
    console.log('Timetable Pages inserted', ttablePagesResult.changes);

    await gtfsToHtml(config);

    for (const page of config.customPages) {
      const pageTemplatePath = path.join(config.templatePath, page.template);
      const outputPath = path.join(config.outputPath, page.output);
      const pageTitle = page.title;

      const html = pug.renderFile(pageTemplatePath, {
        config,
        timetablePage,
        pageTitle,
      });

      await fs.mkdir(path.dirname(outputPath), { recursive: true });

      await fs.writeFile(outputPath, html);
    }

    for (const asset of STATIC_ASSETS) {
      await fs.copyFile(templatePath + asset, buildPath + asset);
    }

    // Copy vendor assets (CSS and JS libraries)
    await fs.cp(templatePath + 'vendor', buildPath + 'vendor', { recursive: true });

    await processFiles({
      sourceFolder: buildPath + folderPath.relativePath,
      defaultMapPagePath: buildPath,
      systemMapPagePath: buildPath + config.systemMapPagePath,
      customHomePagePath: buildPath + config.customHomePagePath,
    });
  } finally {
    db.close();
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});
