# ART Bus Schedules Website
This repo uses the open source node library gtfs-to-html (https://gtfstohtml.com/) to generate a static website of the ART bus schedules by leveraging the city's GTFS data.  The website is currently hosted with AWS Amplify in the custom-dev account.  Committing changes to this repo will automatically trigger a redeployment of the Amplify distribution.

The ```config.json``` file contains both the permanent url for downloading the GTFS data (hosted by Trillium Transit), as well as urls for accessing realtime vehicle locations and trip updates from Swiftly.  The realtime API that fetches the vehicle and trip data from Swiftly is located in the following repo, https://github.com/cityofasheville/art-real-time-api.

## Usage
### Commands
- To test locally, clone this repo and run the following terminal commands:
    1. ```npm install```
    2. ```npm run build``` (generates static HTML files)
    3. ```npm run start``` (starts local Express server)
- When making changes during local testing, you will need to stop the Express server, run the build command to regenerate the HTML files, and restart the server.
- Clean (removes local temp files)
    - ```npm run clean```
