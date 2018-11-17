const express = require('express');
const router = express.Router();
const passport = require('passport');

const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const Room = require('../models/room');
const Owner = require('../models/owner');

const SpotifyStrategy = require('passport-spotify').Strategy;

// Setup logging
const log = require('../../config/logger');

// Setup Redis connection
const redis = require("redis");
const client = redis.createClient();

module.exports = (app) => {
    app.use('/auth', router);
};


passport.use(
    new SpotifyStrategy(
        {
            clientID: appId,
            clientSecret: appSecret,
            callbackURL: 'http://localhost:3000/auth/spotify/callback'
        },
        function (accessToken, refreshToken, expires_in, profile, done) {
            log.debug(`accessToken=${accessToken}`);
            log.debug(`refreshToken=${refreshToken}`);
            log.debug(`expires_in=${new Date().getTime() / 1000 + expires_in.expires_in}`);
            log.debug(`profile=${JSON.stringify(profile)}`);
            // Pass down important auth info too
            profile.accessToken = accessToken;
            profile.refreshToken = refreshToken;
            profile.expires_in = expires_in;

            return done(null, profile);  // TODO: Change profile to user id/key in db

            // Store authenticated user's accesstoken and refreshtoken for this session and all future sessions

            // client.set(room.name, JSON.stringify(room), (err, result) => {
            //     if (err) {
            //         log.error(err);
            //     }
            //
            //     if (result) {
            //         log.info(`Connection to ${room.name} successful`);
            //         res.redirect(`/${room.name}`);
            //     } else {
            //         log.error(`Attempted to join ${room.name} but room doesn't exist`);
            //         res.sendStatus(404);
            //     }
            // });
        }
    )
);

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


router.get(
    '/spotify',
    passport.authenticate('spotify', {  // TODO: We gotta support Spotify Connect AND Spotify app integration
        scope: [
            'playlist-read-private',
            'playlist-modify-public',
            'playlist-read-collaborative',
            'user-read-email',
            'user-read-playback-state',
            'user-read-currently-playing',
            'user-modify-playback-state',
            'app-remote-control',
            'streaming',
            'user-library-read'
        ]
    }),
    function (req, res) {
        // The request will be redirected to spotify for authentication, so this
        // function will not be called.
    }
);


router.get(
    '/spotify/callback',
    passport.authenticate('spotify', { failureRedirect: '/failed-spotify-auth' }),
    function(req, res) {
        // Successful authentication, now create room and redirect owner there

        let tokenExpirationEpoch =
            new Date().getTime() / 1000 + req.user.expires_in.expires_in;

        let newOwner = new Owner(req.user.id, req.user.username, req.user.emails[0].value, req.user.accessToken, req.user.refreshToken, tokenExpirationEpoch);

        let newRoom = new Room(newOwner);
        // Save newRoom into database
        client.set(newRoom.name, JSON.stringify(newRoom), (err, result) => {
            if (err) {
                log.error(err);
            }

            if (result) {
                log.info(`Connection to ${newRoom.name} successful`);
                res.redirect(`/${newRoom.name}`);
            } else {
                log.error(`Attempted to join ${newRoom.name} but room doesn't exist`);
                res.sendStatus(404);
            }
        });

        log.debug("Finished auth spotify calllback");
    }
);
