const express = require('express');
const config = require('./config/config');

const app = express();

// Setup logging
const log = require('./config/logger');

module.exports = require('./config/express')(app, config);
app.listen(config.port, () => {
    log.info('Express server listening on port ' + config.port);
});
