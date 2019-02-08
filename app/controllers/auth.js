const express = require('express');
const router = express.Router();
const passport = require('passport');
const config = require('../../config/config');

const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const Room = require('../models/room');
const Owner = require('../models/owner');

const SpotifyStrategy = require('passport-spotify').Strategy;

// Setup logging
const log = require('../../config/logger');

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
            log.debug(`expires_in=${expires_in.expires_in}`);
            log.debug(`profile=${JSON.stringify(profile)}`);
            // Pass down important auth info too
            profile.accessToken = accessToken;
            profile.refreshToken = refreshToken;
            profile.expires_in = expires_in;

            return done(null, profile);  // TODO: Change profile to user id/key in db
        }
    )
);

passport.serializeUser(function(user, done) {
    done(null, user);
});

passport.deserializeUser(function(obj, done) {
    done(null, obj);
});


router.get( '/spotify', passport.authenticate('spotify', {  // TODO: We gotta support Spotify Connect AND Spotify app integration
        scope: [
            'playlist-read-private',
            'playlist-modify-public',
            'playlist-modify-private',
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


router.get('/spotify/callback', passport.authenticate('spotify', { failureRedirect: '/failed-spotify-auth' }),
    function(req, res) {
        // Successful authentication, now create room and redirect owner there
        let tokenExpirationEpoch = new Date();
        tokenExpirationEpoch.setSeconds(tokenExpirationEpoch.getSeconds() + req.user.expires_in.expires_in);

        log.debug(`Expire date: ${tokenExpirationEpoch}`);

        let newOwner = new Owner(req.cookies.pollifySession, req.user.id, req.user.username, req.user.emails[0].value, req.user.accessToken, req.user.refreshToken, tokenExpirationEpoch);
        let newRoom = new Room(newOwner);

        // Also create spotify playlist for this room
        // I think we can make playlist private because all other user's in room aren't required to login to spotify.
        // They simply use the owner's accessToken, and add/remove tracks with owner's token as well
        if (config.env == 'development') {
            ROOM_NAME = "extra-small-kiss";
            newRoom.name = ROOM_NAME;
        }

        newRoom.spotify.createPlaylist(newOwner.profileId, newRoom.name, { 'public' : false })
            .then( (data) => {
                log.debug(`Created ${newRoom.name} playlist!  playlist id=${data.body.id}`);
                // Make sure to store reference to Room Playlist!  Very important...
                newRoom.playlistId = data.body.id;

                // Save newRoom into database
                newRoom.save(req.app.get('cache'))
                    .then( (success) => {
                        log.info(`Created and saved ${newRoom.name}!!! Redirecting to new room...`);
                        res.redirect(`/${newRoom.name}`);
                    })
                    .catch( (err) => {
                        res.sendStatus(404);
                    }
                );

                // Set shuffle to false, TODO: Capture shuffle state before we change it, then restore after done with pollify
                // TODO: Consider Promise.all to avoid nested promises
                newRoom.spotify.setShuffle({state: 'false'})
                    .then( () => {
                        log.debug(`Turned Shuffle OFF`);
                    })
                    .catch( (err) => {
                        log.error(`Failed to disable Spotify Shuffle, error=${err} and message=${err.message}`);
                    }
                );

                /**
                 * Unfortunately, we are going to have to manually manipulate a Spotify Playlist, inserting, reodering, and removing
                 * to maintain a queue-like structure because Spotify has no API queuing or queue viewing.
                 */

            })
            .catch( (err) => {
                // TODO: ROOM WILL NOT SAVE IF THE PLAYLIST ISN'T CREATED
                log.error(`Failed to create public playlist named ${newRoom.name}! error=${err} and message=${err.message}`);
                res.redirect(`/`);  // TODO: Make sure user knowns why it failed or what they can do to fix it (Premium Spotify only, try again, etc)
            }
        );

        log.debug("Finished auth spotify callback");
    }
);
