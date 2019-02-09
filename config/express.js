const express = require('express');
const glob = require('glob');

const favicon = require('serve-favicon');
const logger = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const compress = require('compression');
const methodOverride = require('method-override');
const passport = require('passport');
const log = require('./logger');

module.exports = (app, config) => {
    const env = process.env.NODE_ENV || 'development';
    app.locals.ENV = env;
    app.locals.ENV_DEVELOPMENT = env == 'development';

    app.set('views', config.root + '/app/views');
    app.set('view engine', 'pug');

    app.use(favicon(config.root + '/public/favicon.ico'));
    app.use(logger('dev'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true
    }));

    app.use(cookieParser());
    app.use(function (req, res, next) {
        // check if client sent cookie
        var cookie = req.cookies.pollifySession;
        if (cookie === undefined) {
            // no: set a new cookie
            var randomNumber = Math.random().toString();
            randomNumber = randomNumber.substring(2, randomNumber.length);
            res.cookie('pollifySession', randomNumber, {
                maxAge: 900000,
                httpOnly: true
            });
            log.debug('cookie created successfully');
        } else {
            // yes, cookie was already present
            log.debug('cookie exists', cookie);
        }
        next(); // <-- important!
    });

    app.use(compress());
    app.use(express.static(config.root + '/public'));
    app.use(methodOverride());

    // Passport initialize
    app.use(passport.initialize());
    app.use(passport.session());

    var controllers = glob.sync(config.root + '/app/controllers/*.js');
    controllers.forEach((controller) => {
        require(controller)(app);
    });

    app.use((req, res, next) => {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });

    if (app.get('env') === 'development') {
        app.use((err, req, res, next) => {
            res.status(err.status || 500);
            res.render('error', {
                message: err.message,
                error: err,
                title: 'error'
            });
        });
    }

    app.use((err, req, res, next) => {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: {},
            title: 'error'
        });
    });

    return app;
};
