const express = require('express');
const config = require('./config/config');

const app = express();

// Setup logging
const log = require('./config/logger');

// Setup Node cache and bind to app
const NodeCache = require("node-cache");
const cache = new NodeCache();
// Store into app with express
app.set('cache', cache);


module.exports = require('./config/express')(app, config);
app.listen(config.port, () => {
    log.info('Express server listening on port ' + config.port);
});

process.on('unhandledRejection', (reason, p) => {
    log.error('Unhandled Rejection at: Promise', p, 'reason:', reason);
    // application specific logging, throwing an error, or other logic here
});
