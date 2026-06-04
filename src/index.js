// Using better-sqlite3 to open database
import { importGtfs } from 'gtfs';
import gtfsToHtml from 'gtfs-to-html';
import pug from 'pug';
import fs, { readFile } from 'fs/promises';
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

/**
 * Fetches content from the WordPress API
 */
async function getWordPressData() {
  const returnedData = {};

  try {
    const [
      howToRideResponse,
      reportIssuesResponse,
      faresAndPassesResponse,
      transitHomepageResponse,
      holidaysResponse,
      adaResponse,
      bikesResponse,
      wifiTermsResponse,
      wifiFaqsResponse,
      passportResponse,
      policiesAndTipsResponse,
      transitNewsResponse,
    ] = await Promise.all([
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/468?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/492?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/424?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/departments/861?_fields=title,content,acf'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/departments/141640?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/494?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/481?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/departments/92483?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/departments/93145?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/departments/99420?_fields=title,content'),
      fetch('https://www.ashevillenc.gov/wp-json/wp/v2/services/488?_fields=title,content'),
      fetch(
        'https://www.ashevillenc.gov/wp-json/wp/v2/posts?avl_department=64&per_page=3&orderby=date&order=desc&_fields=id,title,excerpt,date,link,featured_media,_links&_embed=wp:featuredmedia',
      ),
    ]);

    if (!howToRideResponse.ok) {
      throw new Error(`HTTP error fetching How to Ride! status: ${howToRideResponse.status}`);
    }
    if (!reportIssuesResponse.ok) {
      throw new Error(`HTTP error fetching Report Issues! status: ${reportIssuesResponse.status}`);
    }
    if (!faresAndPassesResponse.ok) {
      throw new Error(
        `HTTP error fetching Fares and Passes! status: ${faresAndPassesResponse.status}`,
      );
    }
    if (!transitHomepageResponse.ok) {
      throw new Error(
        `HTTP error fetching Transit Homepage! status: ${transitHomepageResponse.status}`,
      );
    }
    if (!holidaysResponse.ok) {
      throw new Error(`HTTP error fetching Holidays! status: ${holidaysResponse.status}`);
    }
    if (!adaResponse.ok) {
      throw new Error(`HTTP error fetching ADA! status: ${adaResponse.status}`);
    }
    if (!bikesResponse.ok) {
      throw new Error(`HTTP error fetching Bikes on Buses! status: ${bikesResponse.status}`);
    }
    if (!wifiTermsResponse.ok) {
      throw new Error(`HTTP error fetching Wi-Fi Terms! status: ${wifiTermsResponse.status}`);
    }
    if (!wifiFaqsResponse.ok) {
      throw new Error(`HTTP error fetching Wi-Fi FAQs! status: ${wifiFaqsResponse.status}`);
    }
    if (!passportResponse.ok) {
      throw new Error(`HTTP error fetching Passport! status: ${passportResponse.status}`);
    }
    if (!policiesAndTipsResponse.ok) {
      throw new Error(
        `HTTP error fetching Policies and Tips! status: ${policiesAndTipsResponse.status}`,
      );
    }
    if (!transitNewsResponse.ok) {
      throw new Error(`HTTP error fetching Transit News! status: ${transitNewsResponse.status}`);
    }

    const [
      howToRideData,
      reportIssuesData,
      faresAndPassesData,
      transitHomepageData,
      holidaysData,
      adaData,
      bikesData,
      wifiTermsData,
      wifiFaqsData,
      passportData,
      policiesAndTipsData,
      transitNewsData,
    ] = await Promise.all([
      howToRideResponse.json(),
      reportIssuesResponse.json(),
      faresAndPassesResponse.json(),
      transitHomepageResponse.json(),
      holidaysResponse.json(),
      adaResponse.json(),
      bikesResponse.json(),
      wifiTermsResponse.json(),
      wifiFaqsResponse.json(),
      passportResponse.json(),
      policiesAndTipsResponse.json(),
      transitNewsResponse.json(),
    ]);

    returnedData.howToRide = {
      content: {
        rendered: sanitizeHtml(howToRideData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(howToRideData.title.rendered),
      },
    };

    returnedData.reportIssues = {
      content: {
        rendered: sanitizeHtml(reportIssuesData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(reportIssuesData.title.rendered),
      },
    };

    returnedData.faresAndPasses = {
      content: {
        rendered: sanitizeHtml(faresAndPassesData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(faresAndPassesData.title.rendered),
      },
    };

    returnedData.transitConnect = transitHomepageData.acf;

    returnedData.transitAbout = {
      content: {
        rendered: sanitizeHtml(transitHomepageData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(transitHomepageData.title.rendered),
      },
    };

    returnedData.holidays = {
      content: {
        rendered: sanitizeHtml(holidaysData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(holidaysData.title.rendered),
      },
    };

    returnedData.transitNews = transitNewsData.map((post) => ({
      ...post,
      title: { ...post.title, rendered: sanitizeHtml(post.title.rendered) },
      excerpt: { ...post.excerpt, rendered: sanitizeHtml(post.excerpt.rendered, sanitizeOptions) },
    }));

    returnedData.ada = {
      content: {
        rendered: sanitizeHtml(adaData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(adaData.title.rendered),
      },
    };

    returnedData.bikesOnBuses = {
      content: {
        rendered: sanitizeHtml(bikesData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(bikesData.title.rendered),
      },
    };

    returnedData.wifiTerms = {
      content: {
        rendered: sanitizeHtml(wifiTermsData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(wifiTermsData.title.rendered),
      },
    };

    returnedData.wifiFaqs = {
      content: {
        rendered: sanitizeHtml(wifiFaqsData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(wifiFaqsData.title.rendered),
      },
    };

    returnedData.passport = {
      content: {
        rendered: sanitizeHtml(passportData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(passportData.title.rendered),
      },
    };

    returnedData.policiesAndTips = {
      content: {
        rendered: sanitizeHtml(policiesAndTipsData.content.rendered, sanitizeOptions),
      },
      title: {
        rendered: sanitizeHtml(policiesAndTipsData.title.rendered),
      },
    };
  } catch (error) {
    console.error('Failed to fetch data from WordPress API:', error.message);
    throw error;
  }
  return returnedData;
}

const query1 = `INSERT INTO timetables
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
const query2 = `INSERT INTO timetable_pages (timetable_page_id)
                SELECT DISTINCT route_short_name
                FROM routes`;
const query3 = `SELECT DISTINCT CONCAT(c.start_date,'-',c.end_date) AS relativePath
                FROM calendar c
                WHERE (SELECT MAX(start_date) FROM calendar WHERE strftime('%Y%m%d', 'now') BETWEEN start_date AND end_date) = c.start_date`;

async function main() {
  const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url)));
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

  await fs.rm('./src/tmp', { recursive: true, force: true });
  await fs.mkdir('./src/tmp', { recursive: true });
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

    const ttableResult = runQuery(db, query1);
    const ttablePagesResult = runQuery(db, query2);
    const folderPath = db.prepare(query3).get();

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

    // Build a timetablePage-like object
    const timetablePage = {
      consolidatedTimetables: timetables, // You may want to group/filter these
      stops,
      routes,
      trips,
      directions,
      stopTimes,
      // Add other properties as needed
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

    await fs.copyFile(templatePath + 'favicon.ico', buildPath + 'favicon.ico');
    await fs.copyFile(
      templatePath + 'art-logo-blue-small.png',
      buildPath + 'art-logo-blue-small.png',
    );
    await fs.copyFile(
      templatePath + 'art-logo-blue-small-text-under.png',
      buildPath + 'art-logo-blue-small-text-under.png',
    );
    await fs.copyFile(
      templatePath + 'art-logo-white-small.png',
      buildPath + 'art-logo-white-small.png',
    );
    await fs.copyFile(
      templatePath + 'art-logo-green-small.png',
      buildPath + 'art-logo-green-small.png',
    );
    await fs.copyFile(templatePath + 'art-connect-icon.svg', buildPath + 'art-connect-icon.svg');
    await fs.copyFile(
      templatePath + 'art-logo-white-no-text.png',
      buildPath + 'art-logo-white-no-text.png',
    );

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
    await fs.rm('./src/tmp', { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});
