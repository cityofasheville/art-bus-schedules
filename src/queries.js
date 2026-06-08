// Populate the gtfs-to-html schema from the imported GTFS feed;
export const INSERT_TIMETABLES_QUERY = `INSERT INTO timetables
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

// Create a row in the timetable_pages table for each unique route_short_name, which is used to group timetables by route on the frontend.
export const INSERT_TIMETABLE_PAGES_QUERY = `INSERT INTO timetable_pages (timetable_page_id)
                SELECT DISTINCT route_short_name
                FROM routes`;

// Resolve the calendar window that is currently in service.
export const ACTIVE_PERIOD_QUERY = `SELECT DISTINCT CONCAT(c.start_date,'-',c.end_date) AS relativePath
                FROM calendar c
                WHERE (SELECT MAX(start_date) FROM calendar WHERE strftime('%Y%m%d', 'now') BETWEEN start_date AND end_date) = c.start_date`;
