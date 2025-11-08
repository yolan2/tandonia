const serverless = require('serverless-http');
const app = require('../tandonia_backend.js');

module.exports = serverless(app);
