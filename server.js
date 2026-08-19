const path = require('path');
const dotenv = require('dotenv');

// Load .env from the backend folder explicitly
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

// Change the current working directory to the backend folder 
// so that relative paths work correctly.
process.chdir(path.join(__dirname, 'backend'));

// Execute the actual backend server
require('./backend/server.js');
