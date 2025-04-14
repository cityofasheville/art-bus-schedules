// Using better-sqlite3 to open database
import { importGtfs } from 'gtfs';
import gtfsToHtml from 'gtfs-to-html';
import fs, { readFile } from 'fs/promises';
import Database from 'better-sqlite3';

function runQuery(db,query) {
  const prep = db.prepare(query);
  const result = prep.run();
  return result
}

const url = 'https://data.trilliumtransit.com/gtfs/asheville-nc-us/asheville-nc-us.zip';
const dbPath = './tmp/gtfs.db';
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
                    ) ttbls`;
const query2 = `INSERT INTO timetable_pages (timetable_page_id)
                SELECT DISTINCT route_short_name
                FROM routes`;

await fs.mkdir('./tmp');
const db = new Database(dbPath);

await importGtfs({
  agencies: [
    {
        url: url
    },
  ],
  sqlitePath: dbPath,
});

const ttableResult = runQuery(db,query1);
const ttablePagesResult = runQuery(db,query2);

console.log('Timtables inserted', ttableResult.changes);
console.log('Timtable Pages inserted', ttablePagesResult.changes);

const config = JSON.parse(
  await readFile(new URL('../config.json', import.meta.url))
);

try {
  await gtfsToHtml(config);
  // console.log('Timetables generated successfully');
} catch (err) {
  console.error('Generation failed:', err);
}

db.close();

await fs.rm('./tmp', { recursive: true, force: true });