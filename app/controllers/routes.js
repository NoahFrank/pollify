const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');
const spotify = require('../models/spotify');
const passport = require('passport');

// Setup Redis connection
const redis = require("redis");
const client = redis.createClient();

// Setup logging
const log = require('../../config/logger');

// Print Redis errors
client.on("error", (err) => {
    log.error("Redis Error " + err);
});


const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');

const SpotifyStrategy = require('passport-spotify').Strategy;

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


module.exports = (app) => {
    app.use('/', router);
};

router.get(
    '/auth/spotify',
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
    '/auth/spotify/callback',
    passport.authenticate('spotify', { failureRedirect: '/failed-spotify-auth' }),
    function(req, res) {
        // Successful authentication, redirect home.
        log.debug("Finished auth spotify calllback");
        res.redirect('/');
    }
);


router.get('/', (req, res, next) => {
    // TODO: Be careful on how we store the JS class in Redis
    // Source: https://medium.com/@stockholmux/store-javascript-objects-in-redis-with-node-js-the-right-way-1e2e89dbbf64

    res.render('index', {
        title: "Pollify"
    });
});

router.get('/:roomId', (req, res, next) => {
    let roomId = req.params.roomId;
    client.get(roomId, (err, room) => {
        if (room === null) {
            // doesn't exist
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        } else {
            // render template passing Room object
            log.info(`Rendering ${roomId} with ${room}`);
            room = JSON.parse(room);
            res.render('room', {
                roomId: room.name,
                queue: room.songQueue
            });
        }
    });
});

router.post('/:roomId/vote', (req, res, next) => {
    res.body.trackId.votes++; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.post('/:roomId/unvote', (req, res, next) => {
    res.body.trackId.votes--; // TODO: Assumes trackId being sent in body
    res.redirect(`/${res.params.roomId}`);
});

router.post('/:roomId/pause', (req, res, next) => {
    spotify.pause().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to pause playback.");
    });
});

router.post('/:roomId/play', (req, res, next) => {
    spotify.play().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to play playback.");
    });
});

router.post('/:roomId/skip', (req, res, next) => {
    // TODO: I am starting to think fully using a spotify playlist would be better than mirror state locally
    // TODO: because you can swap the order of songs with the API, and we will be using a shared resource so we will
    // TODO: encounter less concurrency issues.  This will increase the overall reliability and consistent behavior
    // TODO: mitigating race conditions like removing a song and skipping a song at the same time.  This may cost us
    // TODO: performance but does it really? Does it really?  What are we losing?  We can still grab the current playlist
    // TODO: and render our own voting view of it.  We can still pause/play, the only thing we have to mirror is the voting.
    // TODO: Once voting is done, we recalculate the queue, and make sure the spotify queue is the same.  That could be
    // TODO: an issue though, because if we have many swaps, we need to write a custom (insertion) sorting function that
    // TODO: logs all the swaps performed so they can be mirrored on the spotify side.

    Promise.all([client.get(res.params.roomId), spotify.skip()])
        .then( (results) => {
            let room = results[0];
            let skipStatus = results[1];

            Room.skipTrack(room); // Assumes current spotify song, could be painpoint

            res.redirect(`/${res.params.roomId}`);
        }).catch( (err) => {
            log.error(err);
            res.status(500).send("Server error: Failed to skip playback.");
            // TODO: Mirror error in state, put song back?
        });
});

router.post('/:roomId/back', (req, res, next) => {
    // TODO: Mirror state locally in Redis
    spotify.previous().then( (result) => {
        res.redirect(`/${res.params.roomId}`);
    }).catch( (err) => {
        log.error(err);
        res.status(500).send("Server error: Failed to back playback.");
    });
});

router.post('/join', (req, res, next) => {
    let roomId = req.body.roomId;
    if (roomId !== undefined) {
        client.exists(roomId, (err, result) => {
            if (result == 1) {
                log.info(`Connection to ${roomId} successful`);
                res.redirect(`/${roomId}`);
            } else {
                log.error(`Attempted to join ${roomId} but room doesn't exist`);
                res.sendStatus(404);
            }
        });
    } else {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
    }
});

router.post('/create', (req, res, next) => {
    let apiKey = req.body.apiKey;
    let room = new Room(apiKey);
    room.save((err, result) => {
        if (result) {
            log.info(`Connection to ${room.name} successful`);
            res.redirect(`/${room.name}`);
        } else {
            log.error(`Attempted to join ${room.name} but room doesn't exist`);
            res.sendStatus(404);
        }
    });
});

router.get('/:roomId/add/:trackId', (req, res, next) => {
    // 1. Get room
    room = Room.get(req.params.roomId, (err, roomObj) => {
        if (roomObj) {
            let newTrack = new Track("Bob");
            newTrack.getTrackById(roomObj.apiKey, req.params.trackId).then( () => {
                roomObj.addTrack(newTrack);
                roomObj.save((err, result) => {
                    if (err) {
                        log.error(err);
                        res.status(500).send("Server error: Failed to find track.");
                    } else {
                        // 3. Return user to room home
                        res.redirect(`/${roomObj.name}`);
                    }
                });
            }).catch( err => {
                log.error(err);
            });
        } else {
            log.error(`Attempted to find room ${roomId} but doesn't exist`);
            res.sendStatus(404);
        }
    });
});

router.post('/:roomId/search/', (req, res, next) => {
    // 1. Get room
    let roomId = req.params.roomId;
    let trackSearch = req.body.trackSearch;
    client.get(roomId, (err, roomString) => {
        if (roomString === null) {
            // doesn't exist
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        } else {
            log.info(`Found Room ${roomString}`);
            let room = JSON.parse(roomString);
            // 2. Create spotify instance off room
            spotify.setAccessToken(room.apiKey);
            // 3. Query spotify
            spotify.searchTracks(trackSearch)
                .then(function(data) {
                    let tracks = data.body.tracks.items;
                    // 4. Manipulate response to an output we are going to display
                    let trackSearchOutput = [];
                    for (let track of tracks) {
                        let manipulatedTrack = {};
                        manipulatedTrack.id = track.id;
                        manipulatedTrack.name = track.name;
                        manipulatedTrack.albumName = track.album.name;
                        let seconds = track.duration_ms /1000;
                        let minutes = parseInt(seconds / 60);
                        let secondsLeftOver = (seconds%60).toFixed(0);
                        manipulatedTrack.duration = `${minutes}:${secondsLeftOver}`;  // TODO: Convert this to human readable
                        manipulatedTrack.artistName = "";
                        for (let i = 0; i < track.artists.length; i++) {
                            artist = track.artists[i];
                            manipulatedTrack.artistName += artist.name;
                            manipulatedTrack.artistName += ", " ? track.artists.length-1 == i : '';
                        }
                        // put raw track to pass to other routes later
                        manipulatedTrack.rawTrackJson = track;
                        trackSearchOutput.push(manipulatedTrack);
                    }
                    // 5. How to return results
                    res.render('searchResults', {
                        // This doesn't feel great, but not sure how else to
                        // render the search results dynamically without using some
                        // sort of javascript on the frontend to make this query
                        searchQuery: trackSearch,
                        results: trackSearchOutput,
                        roomId: room.name,
                    });
                }, function(err) {
                    // TODO: handle this error more elegantly?
                    log.error(err);
                    res.status(500).send("Server error: Failed to find track.");
                })
                .catch(function(err) {
                    log.error(err);
                    res.status(500).send("Server error: Failed to find track.");
                });
        }
    });
})

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});
