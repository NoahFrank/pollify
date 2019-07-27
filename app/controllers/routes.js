const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');
const Artist = require('../models/artist');
const User = require('../models/user');

// Setup logging
const log = require('../../config/logger');

module.exports = (app) => {
    app.use('/', router);
};

// CONSTANTS
// END CONSTANTS

function noRoomPlaylistError(roomId, res, next) {
    log.error(`This room (${roomId}) has no linked playlist!  That's a huge problem...`);
    res.status(500).send(`Failed to add track because this Room doesn't have a Spotify playlist!`);
    return next();
}

function buildTrackView(track, includeAlbumImage=false, includeFullTrack=false) {
    let manipulatedTrack = new Track();

    // copy over the skip and remove votes
    manipulatedTrack.votedToSkipUsers = track.votedToSkipUsers;
    manipulatedTrack.votedToRemoveUsers = track.votedToRemoveUsers;

    // Set optional fields if supplied
    if (includeFullTrack) {
        // put raw track to pass to other routes later
        manipulatedTrack.rawTrackJson = track;
    }
    if (includeAlbumImage) {
        manipulatedTrack.albumImage = track.album.images[2].url;
    }

    manipulatedTrack.id = track.id;
    manipulatedTrack.name = track.name;
    manipulatedTrack.albumName = track.album.name;
    let seconds = track.duration_ms / 1000;
    let minutes = parseInt(seconds / 60);
    let secondsLeftOver = (seconds%60).toFixed(0);
    manipulatedTrack.duration_ms = `${minutes}:${secondsLeftOver}`;  // TODO: Convert this to human readable
    manipulatedTrack.artistName = "";
    for (let i = 0; i < track.artists.length; i++) {
        let artist = track.artists[i];
        manipulatedTrack.artistName += artist.name;
        manipulatedTrack.artistName += track.artists.length-1 != i ? ", " : '';
    }

    // Need voted users for this track to render how many votes this track has!
    manipulatedTrack.users = track.users;

    return manipulatedTrack;
}

function buildArtistView(artist) {
    let manipulatedArtist = new Artist();

    manipulatedArtist.id = artist.id;
    manipulatedArtist.name = artist.name;
    manipulatedArtist.popularity = artist.popularity;
    manipulatedArtist.genres = artist.genres;
    manipulatedArtist.images = artist.images;

    return manipulatedArtist;
}


router.get('/', (req, res, next) => {
    res.render('index', {
        title: "Pollify"
    });
});

router.get('/:roomId', async (req, res, next) => {
    const roomId = req.params.roomId;
    let cache = req.app.get('cache');
    const includeAlbumImage = true;

    try {
        const room = await Room.get(roomId, cache);
        let userSession = req.cookies.pollifySession;
        if (!userSession) {
            log.debug(`*** Found user session ${userSession} was undefined so lets define it.`);
            User.createUserSession(req, res);
        } else {
            // Only save this user to the room's internal user list
            // if the user isn't undefined.
            room.users.add(userSession);
        }

        // TODO: Get current playlist "queue" state and pass to view
        if (!room.isPlaylistCreated()) {
            return noRoomPlaylistError(roomId, res, next);
        }

        let trackViewList = [];  // Used for rendering queue of Tracks in Room, room.trackList is position-sensitive
        for (let track of room.trackList) {
            // Create a slimmed down version of Track for rendering view with buildTrackView
            let manipulatedTrack = buildTrackView(track, includeAlbumImage);
            // determine if the request user has voted to remove this track or not
            manipulatedTrack.currentUserVotedToRemove = manipulatedTrack.votedToRemoveUsers.has(req.cookies.pollifySession);
            trackViewList.push(manipulatedTrack);
        }

        try {
            // Get room's current playback to pass to view
            const currentPlaybackState = await room.getCurrentPlayback();
            room.save(cache)
                .then( (success) => {
                    log.info(`Rendering ${roomId}`);
                    res.render('room', {
                        roomName: room.name,
                        isOwner: room.isOwner(req.cookies.pollifySession),
                        queue: trackViewList,
                        roomUsers: room.getSetAsArray('users'),
                        roomCurrentPlaybackState: currentPlaybackState,
                        roomVotesToSkipCurrentSong: room.getSetAsArray('votesToSkipCurrentSong'),
                        userVotedToSkipCurrentSong: room.votesToSkipCurrentSong.has(req.cookies.pollifySession)
                    });
                })
                .catch( (err) => {
                        log.error(`Failed to save roomId=${roomId}, error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                        res.sendStatus(404);
                    }
                );
        } catch(err) {
            return res.statusSend(500);
        }
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/vote', async (req, res, next) => {
    const roomId = req.params.roomId;
    let songId = req.body.songId;
    let cache = req.app.get('cache');
    log.info(`Voting in ${roomId} for ${songId}`);

    try {
        const room = await Room.get(roomId, cache);
        let track = room.findTrack(songId);
        if (!track) {
            log.error(`TrackId=${track.id} doesn't exist`);
            res.sendStatus(404);
        }
        room.addTrackVote(req.cookies.pollifySession, track);
        await room.save(cache);
        res.redirect(`/${room.name}`);
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/unvote', async (req, res, next) => {
    const roomId = req.params.roomId;
    const songId = req.body.songId;
    let cache = req.app.get('cache');
    log.info(`Unvoting in ${roomId} for ${songId}`);

    try {
        const room = await Room.get(roomId, cache);
        let track = room.findTrack(songId);
        if (!track) {
            log.error(`TrackId=${track.id} doesn't exist`);
            res.sendStatus(404);
        }
        room.removeTrackVote(req.cookies.pollifySession, track);
        await room.save(cache);
        res.redirect(`/${room.name}`);
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/pause', async (req, res, next) => {
    const roomId = req.params.roomId;
    let cache = req.app.get('cache');
    log.info(`Pausing playback in ${roomId}`);

    try {
        const room = await Room.get(roomId, cache);
        if (!room.isOwner(req.cookies.pollifySession)) {
            return res.sendStatus(403);
        }
        room.spotify.pause()
            .then( (result) => {  // Supports device_id flag
                res.redirect(`/${roomId}`);
            })
            .catch( (err) => {
                    log.error(err);
                    res.status(500).send("Server error: Failed to pause playback.");
                }
            );
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/play', async (req, res, next) => {
    const roomId = req.params.roomId;
    let cache = req.app.get('cache');
    log.info(`Playing/Resuming playback in ${roomId}`);

    try {
        const room = await Room.get(roomId, cache);
        if (!room.isOwner(req.cookies.pollifySession)) {
            return res.sendStatus(403);
        }
        room.spotify.play()
            .then( (result) => {  // Object can be passed to play() to play a specific song, e.g. .play({device_id: wa2324ge5in3E8h, uris: []}
                res.redirect(`/${roomId}`);
            })
            .catch( (err) => {
                    log.error(err);
                    res.status(500).send("Server error: Failed to play playback.");
                }
            );
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/skip', async (req, res, next) => {  // TODO: Should Skip/Back/Play be GET or POST? Owner override or vote-based events?
    // Need some security check that this was actually backed by vote
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    try {
        const room = await Room.get(roomId, cache);

        if (!room.isOwner(req.cookies.pollifySession)) {
            log.info(`Unable to call skip without voting if a user isn't the owner. user=${req.cookies.pollifySession}`);
            return res.sendStatus(403);
        }
        room.spotify.skipToNext()
            .then( (context) => {  // Triggered when skipToNext promise resolves
                if (context.statusCode != 204) {
                    log.error(`Failed to skip track, not HTTP status 204! statusCode=${context.statusCode} and response=${context}`);
                    return res.redirect(`/${roomId}`);
                }
                log.debug(`Successfully skipped to next track for Room ${room.name}`);
                res.redirect(`/${roomId}`);
            })
            .catch( (err) => {
                    // Could be getRoomAndSpotify or skipToNext error
                    log.error(`Failed to skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    res.status(500).send(`Failed to skip Track in queue for your Room`);
                }
            );
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/back', async (req, res, next) => {
    // Need some security check that this was actually backed by vote
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    try {
        const room = await Room.get(roomId, req.app.get('cache'));
        room.spotify.skipToPrevious()
            .then((context) => {  // Triggered when skipToPrevious promise resolves
                if (context.statusCode != 204) {
                    log.error(`Failed to skip to previous track, not HTTP status 204! statusCode=${context.statusCode} and response=${context}`);
                    return res.redirect(`/${roomId}`);
                }
                log.debug(`Successfully skipped to previous track for Room ${room.name}`);
                res.redirect(`/${roomId}`);
            })
            .catch((err) => {
                    // Could be getRoomAndSpotify or skipToNext error
                    log.error(`Failed to skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    res.status(500).send(`Failed to skip Track in queue for your Room`);
                }
            );
    } catch(err) {
        // Could be getRoomAndSpotify or skipToPrevious error
        log.error(`Failed to skip to previous track in queue!`);
        res.status(500).send(`Failed to skip to previous Track in queue for your Room`);
    }
});

router.post('/:roomId/skip/vote', async (req, res, next) => {
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    try {
        const room = await Room.get(roomId, cache);
        room.voteToSkipCurrentSong(req.cookies.pollifySession, cache, (err, result) => {
            if (err) {
                log.error(`Error returned from vote to skip current song. error=${err}`);
                return res.sendStatus(500);
            }
            res.redirect(`/${roomId}`);
        });
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/:roomId/skip/unvote', async (req, res, next) => {
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    try {
        const room = await Room.get(roomId, cache);
        room.unvoteToSkipCurrentSong(req.cookies.pollifySession, cache, (err, result) => {
            if (err) {
                log.error(`Error returned from vote to skip current song. error=${err}`);
                return res.sendStatus(500).send(`Failed to unvote to skip Track in queue for your Room`);
            }
            res.redirect(`/${roomId}`);
        });
    } catch(err) {
        res.sendStatus(404);
    }
});

router.post('/join', (req, res, next) => {
    const roomId = req.body.roomId;
    let cache = req.app.get('cache');

    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    cache.getTtl(roomId, (ttl) => {
        if (ttl === undefined) {  // Undefined means key does not exist
            log.error(`Attempted to join ${roomId} but room doesn't exist with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            res.sendStatus(404);
        } else {  // 0 or timestamp of how long key-value will be in cache
            // save this user to the room's internal user list
            res.redirect(`/${roomId}`);
        }
    });
});

router.get('/:roomId/add/:trackId', async (req, res, next) => {  // TODO: Change back to POST
    const roomId = req.params.roomId;
    const trackId = req.params.trackId;
    if (roomId === undefined || trackId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID or track ID for adding track");
        return next();
    }

    let cache = req.app.get('cache');
    try {
        // 1. Get room and spotify instance for this room
        const room = await Room.get(roomId, cache);
        // 2. Construct new Track object with suggestor and populate Track data with getTrackById
        // TODO: Determine suggestor's name and attach it to Track by passing to constructor
        let newTrack = await new Track("Bob").getTrackById(room.spotify, trackId); // Wait for track to populate data from spotify api with getTrackById
        // 3. Done populating Track!  Now make sure to actually add track to room playlist and redirect back to room after successful queue add
        if (!room.isPlaylistCreated()) {  // Sanity check to ensure the Room actually created a Playlist
            return noRoomPlaylistError(roomId, res, next);
        }

        // 4. Store the populated newTrack Object locally in this room
        room.addTrackToTrackList(newTrack);

        // 5. Kinda Optional. Now we add new track to spotify playlist (only needs to be done for the next track in queue)
        room.spotify.addTracksToPlaylist(room.playlistId, [newTrack.uri])  // Has 3rd options parameter that allows "position"!
            .then( () => {
                // 4. Successful finish! We added the track to the playlist!
                log.debug(`Added track ${newTrack.name} to queue for room ${room.name} from suggestor ${newTrack.suggestor}`);
            })
            .catch( (err) => {
                    // TODO: Notify user we failed to add track to spotify playlist "queue"
                    log.error(`Failed to add track ${newTrack.uri} to playlist for room ${room.name}, likely a spotify API error! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                }
            );

        // 6. Save our room after adding to track list
        await room.save(cache);
        // 7. Return user to room home
        res.redirect(`/${room.name}`);
    } catch(err) {
        // Could be Room.get or getTrackById error
        log.error(`Failed to add track to queue!`);
        res.status(500).send(`Failed to add Track to queue for your Room`);
    }
});

router.post('/:roomId/search/', async (req, res, next) => {
    const roomId = req.params.roomId;
    let searchQuery = req.body.searchQuery;
    let searchType = req.body.searchType.toLowerCase();

    try {
        // 1. Get room
        const room = await Room.get(roomId, req.app.get('cache'));
        log.info(`Found Room for search=${room.name}`);

        // 2. Query spotify for results
        const data = await room.spotify.search(searchQuery, [searchType]);

        let searchOutput = [];

        // Detect searchType and handle based on case
        if (searchType == "track") {
            let tracks = data.body.tracks.items;

            // 3.a Manipulate response to an output we are going to display
            for (let track of tracks) {
                let manipulatedTrack = buildTrackView(track, true, true);
                searchOutput.push(manipulatedTrack);
            }
        } else if (searchType == "artist") {
            let artists = data.body.artists.items;

            // 3.b Manipulate response to an output we are going to display
            for (let artist of artists) {
                let manipulatedArtist = buildArtistView(artist);
                searchOutput.push(manipulatedArtist);
            }
        } else {
            log.error(`Unknown searchType=${searchType}, what do we do with search result data!!`);
        }

        // 4. Render search results
        res.render('searchResults', {
            searchQuery: searchQuery,
            searchType: searchType,
            results: searchOutput,
            room: room,
            roomName: room.name,
            roomUsers: room.getSetAsArray('users')
        });
    } catch(err) {
        // Could be Room.get or spotify.search error
        log.error(`Failed to search for ${searchQuery}!`);
        res.status(500).send(`Failed to add Track to queue for your Room`);
    }
});

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    let roomId = req.params.roomId;
    let trackId = req.params.trackId;
    let cache = req.app.get('cache');

    Room.get(roomId, cache)
        .then( (room) => {
            if (!room.isOwner(req.cookies.pollifySession)) {
                return res.sendStatus(403);
            }
            room.removeTrack(trackId);
            room.save(cache)
                .then( (success) => {
                    res.redirect(`/${room.name}`);
                })
                .catch( (err) => {
                    log.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    res.sendStatus(500);
                }
            );
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/remove/:trackId/vote', async (req, res, next) => {
    let roomId = req.params.roomId;
    let trackId = req.body.trackId;
    let cache = req.app.get('cache');
    log.info(`Voting in ${roomId} for ${trackId} to remove`);

    Room.get(roomId, cache)
        .then( (room) => {
            let track = room.findTrack(trackId);
            if (!track) {
                log.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.voteToRemoveTrack(req.cookies.pollifySession, track, cache, function(err, result) {
                if (err) {
                    log.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    return res.sendStatus(500);
                }
                res.redirect(`/${room.name}`);
            });
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/remove/:trackId/unvote', (req, res, next) => {
    let roomId = req.params.roomId;
    let trackId = req.body.trackId;
    let cache = req.app.get('cache');
    log.info(`Voting in ${roomId} for ${trackId} to remove`);

    Room.get(roomId, cache)
        .then( (room) => {
            let track = room.findTrack(trackId);
            if (!track) {
                log.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.unvoteToRemoveTrack(req.cookies.pollifySession, track, cache);
            room.save(cache)
                .then( (success) => {
                    res.redirect(`/${room.name}`);
                })
                .catch( (err) => {
                    log.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    res.sendStatus(500);
                }
            );
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/getArtistTopTracks/:artistId', async (req, res, next) => {
    const roomId = req.params.roomId;
    let artistId = req.params.artistId;

    try {
        // 1. Get room
        const room = await Room.get(roomId, req.app.get('cache'));
        log.info(`Found Room for search=${room.name}`);

        // 2. Query spotify for results
        // TODO: Localize to country's top tracks
        const data = await room.spotify.getArtistTopTracks(artistId, 'US');

        let searchOutput = [];
        // 3. Build view version of each Track with buildTrackView
        for (let track of data.body.tracks) {
            let manipulatedTrack = buildTrackView(track, true, true);
            searchOutput.push(manipulatedTrack);
        }

        // 4. Render search results in JSON
        res.json({topTrackData: searchOutput});
    } catch(err) {
        // Could be Room.get or spotify.search error
        log.error(`Failed to get top tracks for artist id=${artistId}!`);
        res.status(500).send(`Failed to search for top tracks for artist`);
    }
});

router.delete('/:roomId/close', (req, res, next) => {
    const roomId = req.params.roomId;
    if (req.cookies.pollifySession) {
        let cache = req.app.get('cache');
        Room.get(roomId, cache)
            .then( (room) => {
                room.users.delete(req.cookies.pollifySession);
                room.save(cache);
                res.sendStatus(204);
            })
            .catch( (err) => {
                res.sendStatus(404);
            }
        );
    }
});
