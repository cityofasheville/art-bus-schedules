// Using better-sqlite3 to open database
import { importGtfs } from 'gtfs';
import gtfsToHtml from 'gtfs-to-html';
import pug from 'pug';
import fs, { readFile } from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';

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
  let defaultData = null;
  let returnedData = {};

  try {
    const planYourTripResponse = await fetch(
      'https://www.ashevillenc.gov/wp-json/wp/v2/services/468'
    );
    const faresAndPassesResponse = await fetch(
      'https://www.ashevillenc.gov/wp-json/wp/v2/services/424'
    );
    if (!planYourTripResponse.ok) {
      throw new Error(`HTTP error fetching Plan Your Trip! status: ${planYourTripResponse.status}`);
    }
    if (!faresAndPassesResponse.ok) {
      throw new Error(
        `HTTP error fetching Fares and Passes! status: ${faresAndPassesResponse.status}`
      );
    }
    const planYourTripData = await planYourTripResponse.json();
    const faresAndPassesData = await faresAndPassesResponse.json();
    returnedData.planYourTrip = planYourTripData;
    returnedData.faresAndPasses = faresAndPassesData;
    returnedData.title = 'HC title';
    returnedData.content = 'HC content';
  } catch (error) {
    console.error('Failed to fetch data from WordPress API:', error.message);
    return defaultData;
  }
  return returnedData;
}

const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url)));
const url = config.agencies[0].url;
const dbPath = config.sqlitePath;
const templatePath = config.templatePath;
const buildPath = config.outputPath;
config.wordpress = await getWordPressData();
config.logo_url = '/art-logo.png';

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

await fs.mkdir('./src/tmp');
const db = new Database(dbPath);

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

// Build a timetablePage-like object
const timetablePage = {
  consolidatedTimetables: timetables, // You may want to group/filter these
  stops,
  routes,
  trips,
  directions,
  // Add other properties as needed
};

config.timetablePage = timetablePage;

console.log('Timtables inserted', ttableResult.changes);
console.log('Timtable Pages inserted', ttablePagesResult.changes);

try {
  await gtfsToHtml(config);
  // console.log('Timetables generated successfully');
} catch (err) {
  console.error('Generation failed:', err);
  await fs.rm('./src/tmp', { recursive: true, force: true });
}

db.close();

for (const page of config.customPages) {
  const templatePath = path.join(config.templatePath, page.template);
  const outputPath = path.join(config.outputPath, page.output);

  const html = pug.renderFile(templatePath, {
    config,
    timetablePage, // Now available in your template
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await fs.writeFile(outputPath, html);
}

await fs.rm('./src/tmp', { recursive: true, force: true });
await fs.copyFile(templatePath + 'favicon.ico', buildPath + 'favicon.ico');
await fs.copyFile(templatePath + 'art-logo.png', buildPath + 'art-logo.png');

// const htmlSourceFolder = buildPath + folderPath.relativePath;
// const defaultHomePagePath = buildPath;
// const customHomePagePath = buildPath + config.customHomePagePath;
// const systemMapPagePath = buildPath + config.systemMapPagePath;

await processFiles({
  sourceFolder: buildPath + folderPath.relativePath,
  defaultMapPagePath: buildPath,
  systemMapPagePath: buildPath + config.systemMapPagePath,
  customHomePagePath: buildPath + config.customHomePagePath,
});
