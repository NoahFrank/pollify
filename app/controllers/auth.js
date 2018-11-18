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
        let tokenExpirationEpoch = new Date().getTime() / 1000 + req.user.expires_in.expires_in;

        let newOwner = new Owner(req.user.id, req.user.username, req.user.emails[0].value, req.user.accessToken, req.user.refreshToken, tokenExpirationEpoch);
        let newRoom = new Room(newOwner);

        // Also create spotify playlist for this room
        let spotify = require('../models/spotify')(newOwner);
        // I think we can make playlist private because all other user's in room aren't required to login to spotify.
        // They simply use the owner's accessToken, and add/remove tracks with owner's token as well
        spotify.createPlaylist(newOwner.profileId, newRoom.name, { 'public' : false })
            .then((data) => {
                log.debug(`Created ${newRoom.name} playlist!  playlist id=${JSON.stringify(data)}`);
                // Make sure to store reference to Room Playlist!  Very important...
                newRoom.roomPlaylistId = data.id;

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

                // Set shuffle to false, TODO: Capture shuffle state before we change it, then restore after done with pollify
                spotify.setShuffle({state: 'false'});

                /**
                 * Unfortunately, we are going to have to manually manipulate a Spotify Playlist, inserting, reodering, and removing
                 * to maintain a queue-like structure because Spotify has no API queuing or queue viewing.
                 */

            }).catch( (err) => {
                // TODO: ROOM WILL NOT SAVE IF THE PLAYLIST ISN'T CREATED
                log.error(`Failed to create public playlist named ${newRoom.name}!`, err);
                res.redirect(`/`);  // TODO: Make sure user knowns why it failed or what they can do to fix it (Premium Spotify only, try again, etc)
            });

        log.debug("Finished auth spotify callback");
    }
);
