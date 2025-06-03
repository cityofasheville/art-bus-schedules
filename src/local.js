import express from 'express';
import path from 'path';

// Create an Express application
const app = express();

// Define the port the server will listen on
const port = 3000;
const __dirname = './build';

// Serve static files from the 'build' directory
app.use(express.static(__dirname));

// Define a basic route for the homepage (/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the server and listen on the specified port
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});