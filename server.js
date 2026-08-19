const path = require('path');

// Change working directory to backend so dotenv and all relative paths work
process.chdir(path.join(__dirname, 'backend'));

// Execute the actual backend server (it loads its own dotenv)
require('./backend/server.js');
