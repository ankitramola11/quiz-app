const path = require('path');

// Change the current working directory to the backend folder 
// so that .env and other relative paths work correctly.
process.chdir(path.join(__dirname, 'backend'));

// Execute the actual backend server
require('./backend/server.js');
