const express = require('express');
const router = express.Router();

const Room = require('../models/room');
const Track = require('../models/track');
const Artist = require('../models/artist');

// Setup logging
const log = require('../../config/logger');

module.exports = (app) => {
    app.use('/', router);
};

// CONSTANTS
const ADDED_TRACK_KEY = "RecentlyAddedTrackThatNeedsToBeStoredBecauseSpotifyDoesn'tUpdateThatQuick";
// END CONSTANTS

function saltAddedTrackKey(roomId) {
    return ADDED_TRACK_KEY + roomId;
}

function noRoomPlaylistError(roomId, res, next) {
    log.error(`This room (${roomId}) has no linked playlist!  That's a huge problem...`);
    res.status(500).send(`Failed to add track because this Room doesn't have a Spotify playlist!`);
    return next();
}


function buildTrackView(track, includeAlbumImage=false, includeFullTrack=false) {
    let manipulatedTrack = new Track();

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

router.get('/:roomId', (req, res, next) => {
    let roomId = req.params.roomId;
    let cache = req.app.get('cache');
    const includeAlbumImage = true;

    Room.get(roomId, cache)
        .then( (room) => {
            // save this user to the room's internal user list
            room.users.add(req.cookies.pollifySession);

            // TODO: Get current playlist "queue" state and pass to view
            if (!room.isPlaylistCreated()) {
                return noRoomPlaylistError(roomId, res, next);
            }

            room.spotify.getPlaylistTracks(room.playlistId)
                .then( (playlistTracks) => {
                    let trackSearchOutput = [];
                    let tracks = playlistTracks.body.items;

                    let addedTrack = null;
                    let isAddedTrackAlreadyInPlaylist = false;
                    const saltedAddedTrackKey = saltAddedTrackKey(roomId);
                    if (cache.ttl(saltedAddedTrackKey) !== undefined) {  // Ensure we check SALTED key to avoid collisions
                        addedTrack = cache.get(saltedAddedTrackKey);
                        log.debug(`Got passed track context from redirect!`);
                    }

                    for (let track of tracks) {
                        track = track.track;  // Playlist Tracks have more info, so Track info is nested

                        // If there is a new addedTrack, then we need to check if its already in the playlist
                        if (addedTrack && track.id == addedTrack.id) {
                            isAddedTrackAlreadyInPlaylist = true;
                        }

                        let manipulatedTrack = buildTrackView(track, includeAlbumImage);
                        room.initializeTrackList(manipulatedTrack);
                    }

                    // Add track if we don't already have it!  If Spotify already has it, then we ignore this if statement
                    if (!isAddedTrackAlreadyInPlaylist && addedTrack) {
                        let manipulatedTrack = buildTrackView(addedTrack, includeAlbumImage);
                        room.initializeTrackList(manipulatedTrack);

                        // Make sure to reset cache key for next time
                        cache.del(saltedAddedTrackKey);
                    }

                    // Get room's current playback
                    room.getCurrentPlayback( (err, result) => {
                        if (err) {
                            log.error(`Failed to get Room ${roomId}'s current playback state with error=${err}`);
                            res.statusSend(500);
                        }
                        room.save(cache)
                            .then( (success) => {
                                log.info(`Rendering ${roomId}`);
                                res.render('room', {
                                    roomName: room.name,
                                    isOwner: room.isOwner(req.cookies.pollifySession),
                                    queue: room.trackList,
                                    roomUsers: room.getSetAsArray('users'),
                                    roomCurrentPlaybackState: room.currentPlaybackState,
                                    roomVotesToSkipCurrentSong: room.getSetAsArray('votesToSkipCurrentSong'),
                                    userVotedToSkipCurrentSong: room.votesToSkipCurrentSong.has(req.cookies.pollifySession)
                                });
                            })
                            .catch( (err) => {
                                res.sendStatus(404);
                            }
                        );
                    });
                })
                .catch( (err) => {
                    log.error(`Failed to get Room ${roomId}'s Spotify playlist with error=${err} and message=${err.message}`);
                    res.status(500).send("Failed to get Spotify Playlist for this Room");
                    return next();
                }
            );
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/vote', (req, res, next) => {
    let roomId = req.params.roomId;
    let songId = req.body.songId;
    let cache = req.app.get('cache');
    log.info(`Voting in ${roomId} for ${songId}`);

    Room.get(roomId, cache)
        .then( (room) => {
            let track = room.findTrack(songId);
            if (!track) {
                log.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.addTrackVote(req.cookies.pollifySession, track);
            room.save(cache);
            res.redirect(`/${room.name}`);
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/unvote', (req, res, next) => {
    let roomId = req.params.roomId;
    let songId = req.body.songId;
    let cache = req.app.get('cache');
    log.info(`Unvoting in ${roomId} for ${songId}`);

    Room.get(roomId, cache)
        .then( (room) => {
            let track = room.findTrack(songId);
            if (!track) {
                log.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.removeTrackVote(req.cookies.pollifySession, track);
            room.save(cache);
            res.redirect(`/${room.name}`);
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/pause', (req, res, next) => {
    let roomId = req.params.roomId;
    let cache = req.app.get('cache');
    log.info(`Pausing playback in ${roomId}`);

    Room.get(roomId, cache)
        .then( (room) => {
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
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/play', (req, res, next) => {
    let roomId = req.params.roomId;
    let cache = req.app.get('cache');
    log.info(`Playing/Resuming playback in ${roomId}`);

    Room.get(roomId, cache)
        .then( (room) => {
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
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/skip', (req, res, next) => {  // TODO: Should Skip/Back/Play be GET or POST? Owner override or vote-based events?
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    Room.get(roomId, cache)
        .then( (room) => {
            if (!room.isOwner(req.cookies.pollifySession)) {
                log.info(`Unable to call skip without voting if a user isn't the owner. user=${req.cookies.pollifySession}`);
                return res.sendStatus(403);
            }
            room.spotify.skipToNext()
                .then( (context) => {  // Triggered when skipToNext promise resolves
                    if (context.statusCode != 204) {
                        log.error(`Failed to skip track! statusCode=${context.statusCode} and response=${context}`);
                        return res.redirect(`/${roomId}`);
                    }
                    log.debug(`Successfully skipped to next track for Room ${room.name}`);
                    res.redirect(`/${roomId}`);
                })
                .catch( (err) => {
                    // Could be getRoomAndSpotify or skipToNext error
                    log.error(`Failed to skip track in queue! error=${err} and message=${err.message}`);
                    res.status(500).send(`Failed to skip Track in queue for your Room`);
                }
            );
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/back', (req, res, next) => {
    // Need some security check that this was actually backed by vote
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            return Promise.all([room, room.spotify.skipToPrevious()]);
        })
        .then( (context) => {  // Triggered when skipToPrevious promise resolves
            let [room, skipToPreviousResult] = context;
            log.debug(`Successfully skipped to previous track for Room ${room.name}`);
            res.redirect(`/${roomId}`);
        })
        .catch( (err) => {
            // Could be getRoomAndSpotify or skipToPrevious error
            log.error(`Failed to skip to previous track in queue! error=${err} and ${err.message}`);
            res.status(500).send(`Failed to skip to previous Track in queue for your Room`);
        }
    );
});

router.post('/:roomId/skip/vote', (req, res, next) => {
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    Room.get(roomId, cache)
        .then( (room) => {
            room.voteToSkipCurrentSong(req.cookies.pollifySession, cache, (err, result) => {
                if (err) {
                    log.error(`Error returned from vote to skip current song. error=${err}`);
                    return res.sendStatus(500);
                }
                res.redirect(`/${roomId}`);
            });
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/:roomId/skip/unvote', (req, res, next) => {
    let roomId = req.params.roomId;
    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    let cache = req.app.get('cache');

    Room.get(roomId, cache)
        .then( (room) => {
            room.unvoteToSkipCurrentSong(req.cookies.pollifySession, cache, (err, result) => {
                if (err) {
                    log.error(`Error returned from vote to skip current song. error=${err}`);
                    return res.sendStatus(500).send(`Failed to unvote to skip Track in queue for your Room`);
                }
                res.redirect(`/${roomId}`);
            });
        })
        .catch( (err) => {
            log.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
    );
});

router.post('/join', (req, res, next) => {
    let roomId = req.body.roomId;
    let cache = req.app.get('cache');

    if (roomId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    cache.getTtl(roomId, (ttl) => {
        if (ttl === undefined) {  // Undefined means key does not exist
            log.error(`Attempted to join ${roomId} but room doesn't exist with error=${err} and message=${err.message}`);
            res.sendStatus(404);
        } else {  // 0 or timestamp of how long key-value will be in cache
            // save this user to the room's internal user list
            res.redirect(`/${roomId}`);
        }
    });
});

router.get('/:roomId/add/:trackId', (req, res, next) => {  // TODO: Change back to POST
    let roomId = req.params.roomId;
    let trackId = req.params.trackId;
    if (roomId === undefined || trackId === undefined) {
        log.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID or track ID for adding track");
        return next();
    }

    let cache = req.app.get('cache');
    // 1. Get room and spotify instance for this room
    Room.get(roomId, cache)
        .then( (room) => {
            // 2. Construct new Track object with suggestor and populate Track data with getTrackById
            let newTrack = new Track("Bob");  // TODO: Determine suggestor's name
            // This "joins" all Promises together usually, but in this case we use it to pass context to the next .then()
            // while also resolving the getTrackById promise and its resolved value(s)
            return Promise.all([room, newTrack.getTrackById(room.spotify, trackId)]);
        })
        .then( (context) => {
            let [room, newTrack] = context;  // Array deconstruction, why can't we have nice things
            // 3. Done populating Track!  Now make sure to actually add track to room playlist and redirect back to room after successful queue add
            if (!room.isPlaylistCreated()) {  // Sanity check to ensure the Room actually created a Playlist
                return noRoomPlaylistError(roomId, res, next);
            }

            // TODO: Consider returning the addTracksToPlaylist promise and making another .then() chain to keep uniformity
            room.spotify.addTracksToPlaylist(room.playlistId, [newTrack.uri])  // Has 3rd options parameter that allows "position"!
                .then( () => {
                    // 4. Successful finish! We added the track to the playlist!
                    // TODO: Handle positioning of the track in queue
                    log.debug(`Added track ${newTrack.name} to queue for room ${room.name} from suggestor ${newTrack.suggestor}`);
                })
                .catch( (err) => {
                    // TODO: Notify user we failed to add track to spotify playlist "queue"
                    log.error(`Failed to add track ${newTrack.uri} to playlist for room ${room.name}, likely a spotify API error! error=${err} and message=${err.message}`);
                }
            );

            // 5. Return user to room home with addedTrack in cache
            cache.set(saltAddedTrackKey(roomId), newTrack);
            res.redirect(`/${room.name}`);
        })
        .catch( (err) => {
            // Could be Room.get or getTrackById error
            log.error(`Failed to add track to queue! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to add Track to queue for your Room`);
        }
    );
});

router.post('/:roomId/search/', (req, res, next) => {
    // 1. Get room
    let roomId = req.params.roomId;
    let searchQuery = req.body.searchQuery;
    let searchType = req.body.searchType.toLowerCase();
    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            log.info(`Found Room for search=${room.name}`);
            // 2. Query spotify for results
            return Promise.all([room, room.spotify.search(searchQuery, [searchType])]);  // Can search many types or combinations of ['album', 'artist', 'playlist', and 'track']
        })
        .then( (context) => {
            let [room, data] = context;  // Array deconstruction, why can't we have nice things
            let searchOutput = [];

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
        })
        .catch( (err) => {
            // Could be Room.get or spotify.search error
            log.error(`Failed to search for ${searchQuery}! error=${err} and message=${err.message}`);
            res.status(500).send(`Failed to add Track to queue for your Room`);
        }
    );
});

router.post('/:roomId/remove/:trackId', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

// TODO: Make powerhour
router.post('/:roomId/powerhour', (req, res, next) => {
    res.render('index', { title: 'Express' });
});

router.post('/:roomId/getArtistTopTracks/:artistId', (req, res, next) => {
    let roomId = req.params.roomId;
    let artistId = req.params.artistId;

    Room.get(roomId, req.app.get('cache'))
        .then( (room) => {
            log.info(`Found Room for search=${room.name}`);
            // 2. Query spotify for results
            // TODO: Localize to country's top tracks
            return Promise.all([room, room.spotify.getArtistTopTracks(artistId, 'US')]);  // Can search many types or combinations of ['album', 'artist', 'playlist', and 'track']
        })
        .then( (context) => {
            let [room, data] = context;  // Array deconstruction, why can't we have nice things
            let searchOutput = [];

            for (let track of data.body.tracks) {
                let manipulatedTrack = buildTrackView(track, true, true);
                searchOutput.push(manipulatedTrack);
            }

            // 4. Render search results
            res.json({topTrackData: searchOutput});
        })
        .catch( (err) => {
                // Could be Room.get or spotify.search error
                log.error(`Failed to get top tracks for artist id=${artistId}! error=${err} and message=${err.message}`);
                res.status(500).send(`Failed to search for top tracks for artist`);
            }
        );
});

router.delete('/:roomId/close', (req, res, next) => {
    let roomId = req.params.roomId;
    if (req.cookies.pollifySession) {
        let cache = req.app.get('cache');
        Room.get(roomId, cache)
            .then( (room) => {
                room.users.delete(req.cookies.pollifySession);
                room.save(cache);
                res.sendStatus(204);
            })
            .catch( (err) => {
                log.error(`${roomId} doesn't exist`);
                res.sendStatus(404);
            }
        );
    }
});
