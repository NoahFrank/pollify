const path = require('path');
const rootPath = path.normalize(__dirname + '/..');
const env = process.env.NODE_ENV || 'development';

// Change default port
const port = 3000;
const addr = 'localhost';

const config = {
    development: {
        root: rootPath,
        app: {
            name: 'pollify'
        },
        env: 'development',
        port: process.env.PORT || port,
        addr: process.env.ADDR || addr
    },

    test: {
        root: rootPath,
        app: {
            name: 'pollify'
        },
        env: 'test',
        port: process.env.PORT || port,
        addr: process.env.ADDR || addr
    },

    production: {
        root: rootPath,
        app: {
            name: 'pollify'
        },
        env: 'production',
        port: process.env.PORT || port,
        addr: process.env.ADDR || addr
    }
};

module.exports = config[env];
