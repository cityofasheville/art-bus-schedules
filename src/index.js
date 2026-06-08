import { importGtfs } from 'gtfs';
import gtfsToHtml from 'gtfs-to-html';
import pug from 'pug';
import fs from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import { getWordPressData } from './wordpress.js';
import {
  INSERT_TIMETABLES_QUERY,
  INSERT_TIMETABLE_PAGES_QUERY,
  ACTIVE_PERIOD_QUERY,
} from './queries.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Builds the static ART transit site: imports GTFS data, fetches WordPress
 * content, renders all templated pages, then copies static assets
 * and flattens the output into per-page folders.
 *
 * @returns {Promise<void>}
 */
async function mainBuild() {
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
      agencies: [{ url }],
      sqlitePath: dbPath,
    });

    const ttableResult = db.prepare(INSERT_TIMETABLES_QUERY).run();
    const ttablePagesResult = db.prepare(INSERT_TIMETABLE_PAGES_QUERY).run();
    const folderPath = db.prepare(ACTIVE_PERIOD_QUERY).get();

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

      const html = pug.renderFile(pageTemplatePath, {
        config,
        timetablePage,
        pageTitle: page.title,
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
      customMapPagePath: buildPath + config.customMapPagePath,
      customHomePagePath: buildPath + config.customHomePagePath,
    });
  } finally {
    db.close();
    await fs.rm(TMP_DIR, { recursive: true, force: true });
  }
}

mainBuild().catch((err) => {
  console.error('Build failed:', err);
  process.exitCode = 1;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Flattens the GTFS-to-HTML build output: each generated file becomes its own
 * `<name>/index.html` folder, and the map / custom-home pages are moved into place.
 *
 * @param {Object} [options]
 * @param {string} [options.sourceFolder] - Folder of generated files to flatten.
 *   Required; the function logs and returns early if omitted.
 * @param {string} [options.defaultMapPagePath] - Build root holding the default map page.
 * @param {string} [options.customHomePagePath] - Folder holding the custom home page.
 * @param {string} [options.customMapPagePath] - Destination folder for the relocated map page.
 * @returns {Promise<void>}
 */
async function processFiles({
  sourceFolder,
  defaultMapPagePath,
  customHomePagePath,
  customMapPagePath,
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

        await fs.mkdir(newFolderName, { recursive: true });
        await fs.rename(filePath, newFilePath);

        console.log(`Processed: ${file} -> ${newFilePath}`);
      }
    }

    if (customMapPagePath) {
      const mapSrc = path.join(defaultMapPagePath, 'index.html');
      const mapDest = path.join(customMapPagePath, 'index.html');

      await fs.mkdir(customMapPagePath, { recursive: true });
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
    console.error('An error occurred processing files:', err);
  }
}
