// // const express = require('express');
// import * as express from "express";
// const router = express.Router();

import { Room } from "../models/room";
import { Track } from "../models/track";
import { Artist } from "../models/artist";
import { User } from "../models/user";

// // Setup logging
// import { log } from "../config/logger";
// import { Application, NextFunction } from "express";
import { Request, Response, NextFunction } from "express-serve-static-core";
import logger from "../util/logger";
// import { app } from "../app";

// module.exports = (app: Application) => {
//     app.use("/", router);
// };

function noRoomPlaylistError(roomId: string, res: Response, next: NextFunction) {
    logger.error(`This room (${roomId}) has no linked playlist!  That's a huge problem...`);
    res.status(500).send("Failed to add track because this Room doesn't have a Spotify playlist!");
    return next();
}

function buildTrackView(track: SpotifyApi.TrackObjectFull, includeAlbumImage = false, includeFullTrack = false) {
    const manipulatedTrack = new Track();

    // Set optional fields if supplied
    if (includeFullTrack) {
        // put raw track to pass to other routes later
        manipulatedTrack.rawTrackJson = JSON.stringify(track);
    }
    if (includeAlbumImage) {
        manipulatedTrack.albumImage = track.album.images[2].url;
    }

    manipulatedTrack.id = track.id;
    manipulatedTrack.name = track.name;
    manipulatedTrack.albumName = track.album.name;
    manipulatedTrack.duration_ms = track.duration_ms;  // TODO: Convert this to human readable
    manipulatedTrack.setDuration(manipulatedTrack.duration_ms);
    manipulatedTrack.artistName = "";
    for (let i = 0; i < track.artists.length; i++) {
        const artist = track.artists[i];
        manipulatedTrack.artistName += artist.name;
        manipulatedTrack.artistName += track.artists.length - 1 != i ? ", " : "";
    }

    // Need voted users for this track to render how many votes this track has!
    // manipulatedTrack.users = track.users;
    // copy over the skip and remove votes
    // manipulatedTrack.votedToSkipUsers = track.votedToSkipUsers;
    // manipulatedTrack.votedToRemoveUsers = track.votedToRemoveUsers;

    return manipulatedTrack;
}

function buildArtistView(artist: SpotifyApi.ArtistObjectFull) {
    const manipulatedArtist = new Artist();

    manipulatedArtist.id = artist.id;
    manipulatedArtist.name = artist.name;
    manipulatedArtist.popularity = artist.popularity;
    manipulatedArtist.genres = artist.genres;
    manipulatedArtist.images = artist.images;

    return manipulatedArtist;
}

export const home = (req: Request, res: Response) => {
    res.render("migrated/index", {
        title: "Pollify"
    });
};

export const findRoom = async (req: Request, res: Response, next: NextFunction) => {
    const roomId = req.params.roomId;
    const cache = req.app.get("cache");

    try {
        const room = await Room.get(roomId, cache);
        const userSession: string = req.cookies.pollifySession;
        if (!userSession) {
            logger.debug(`*** Found user session ${userSession} was undefined so lets define it.`);
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

        const trackViewList: Track[] = [];  // Used for rendering queue of Tracks in Room, room.trackList is position-sensitive
        for (const track of room.trackList) {
            // Create a slimmed down version of Track for rendering view with buildTrackView
            const manipulatedTrack = Track.copy(track);
            // determine if the request user has voted to remove this track or not
            manipulatedTrack.currentUserVotedToRemove = track.votedToRemoveUsers.has(userSession);
            trackViewList.push(manipulatedTrack);
        }

        try {
            // Get room's current playback to pass to view
            const currentPlaybackState = await room.getCurrentPlayback();

            // Update room to determine if the owner is currently utilizing their currently allotted pollify room playlist or just their normal spotify
            await room.updateRoomStatus(currentPlaybackState);

            room.save(cache)
                .then((success) => {
                    logger.info(`Rendering ${roomId}`);
                    logger.debug(`Current playback state. CurrentPlaybackState=${JSON.stringify(currentPlaybackState)}`);
                    res.render("migrated/room", {
                        roomName: room.name,
                        isOwner: room.isOwner(req.cookies.pollifySession),
                        queue: trackViewList,
                        roomUsers: room.getSetAsArray("users"),
                        roomCurrentPlaybackState: currentPlaybackState,
                        roomVotesToSkipCurrentSong: room.getSetAsArray("votesToSkipCurrentSong"),
                        userVotedToSkipCurrentSong: room.votesToSkipCurrentSong.has(req.cookies.pollifySession)
                    });
                })
                .catch((err) => {
                    logger.error(`Failed to save roomId=${roomId}, error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    res.sendStatus(404);
                }
                );
        } catch (err) {
            logger.error(`Failure when attempting to serve roomId=${roomId} because -> ${err}`);
            return res.sendStatus(500);
        }
    } catch (err) {
        logger.error(`Unhandled Exception. error=${err} message=${err.message} stack=${err.stack}`);
        res.sendStatus(404);
    }
};

export const roomVote = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const songId = req.body.songId;
    const cache = req.app.get("cache");
    logger.info(`Voting in ${roomId} for ${songId}`);

    try {
        const room = await Room.get(roomId, cache);
        const track = room.findTrack(songId);
        if (!track) {
            logger.error(`TrackId=${track.id} doesn't exist`);
            res.sendStatus(404);
        }
        room.addTrackVote(req.cookies.pollifySession, track);
        await room.save(cache);
        res.redirect(`/room/${room.name}`);
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomUnvote = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const songId = req.body.songId;
    const cache = req.app.get("cache");
    logger.info(`Unvoting in ${roomId} for ${songId}`);

    try {
        const room = await Room.get(roomId, cache);
        const track = room.findTrack(songId);
        if (!track) {
            logger.error(`TrackId=${track.id} doesn't exist`);
            res.sendStatus(404);
        }
        room.removeTrackVote(req.cookies.pollifySession, track);
        await room.save(cache);
        res.redirect(`/room/${room.name}`);
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomPause = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const cache = req.app.get("cache");
    logger.info(`Pausing playback in ${roomId}`);

    try {
        const room = await Room.get(roomId, cache);
        if (!room.isOwner(req.cookies.pollifySession)) {
            return res.sendStatus(403);
        }
        room.spotify.pause()
            .then((result) => {  // Supports device_id flag
                res.redirect(`/room/${roomId}`);
            })
            .catch((err) => {
                logger.error(err);
                res.status(500).send("Server error: Failed to pause playback.");
            }
            );
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomPlay = async (req: Request, res: Response, next: NextFunction) => {
    const roomId = req.params.roomId;
    const cache = req.app.get("cache");
    logger.info(`Playing/Resuming playback in ${roomId}`);

    try {
        const room = await Room.get(roomId, cache);
        if (!room.isOwner(req.cookies.pollifySession)) {
            return res.sendStatus(403);
        }
        room.spotify.play()
            .then((result) => {  // Object can be passed to play() to play a specific song, e.g. .play({device_id: wa2324ge5in3E8h, uris: []}
                res.redirect(`/room/${roomId}`);
            })
            .catch((err) => {
                logger.error(err);
                res.status(500).send("Server error: Failed to play playback.");
            }
            );
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomSkip = async (req: Request, res: Response, next: NextFunction) => {  // TODO: Should Skip/Back/Play be GET or POST? Owner override or vote-based events?
    // Need some security check that this was actually backed by vote
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        logger.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    const cache = req.app.get("cache");

    try {
        const room = await Room.get(roomId, cache);

        if (!room.isOwner(req.cookies.pollifySession)) {
            logger.info(`Unable to call skip without voting if a user isn't the owner. user=${req.cookies.pollifySession}`);
            return res.sendStatus(403);
        }
        room.spotify.skipToNext()
            .then((context) => {  // Triggered when skipToNext promise resolves
                const respContext = context as unknown as Response;
                if (respContext.statusCode != 204) {
                    logger.error(`Failed to skip track, not HTTP status 204! statusCode=${respContext.statusCode} and response=${respContext}`);
                    return res.redirect(`/${roomId}`);
                }
                logger.debug(`Successfully skipped to next track for Room ${room.name}`);
                res.redirect(`/room/${roomId}`);
            })
            .catch((err) => {
                // Could be getRoomAndSpotify or skipToNext error
                logger.error(`Failed to skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                res.status(500).send("Failed to skip Track in queue for your Room");
            }
            );
    } catch (err) {
        res.sendStatus(404);
    }
};

// router.post("/:roomId/back", async (req: Request, res: Response, next: NextFunction) => {
//     // Need some security check that this was actually backed by vote
//     const roomId = req.params.roomId;
//     if (roomId === undefined) {
//         log.error(`Connection to ${roomId} failed`);
//         res.sendStatus(400);
//         return next();
//     }

//     try {
//         const room = await Room.get(roomId, req.app.get("cache"));
//         room.spotify.skipToPrevious()
//             .then((context: Response) => {  // Triggered when skipToPrevious promise resolves
//                 if (context.statusCode != 204) {
//                     log.error(`Failed to skip to previous track, not HTTP status 204! statusCode=${context.statusCode} and response=${context}`);
//                     return res.redirect(`/${roomId}`);
//                 }
//                 log.debug(`Successfully skipped to previous track for Room ${room.name}`);
//                 res.redirect(`/${roomId}`);
//             })
//             .catch((err) => {
//                 // Could be getRoomAndSpotify or skipToNext error
//                 log.error(`Failed to skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
//                 res.status(500).send("Failed to skip Track in queue for your Room");
//             }
//             );
//     } catch (err) {
//         // Could be getRoomAndSpotify or skipToPrevious error
//         log.error("Failed to skip to previous track in queue!");
//         res.status(500).send("Failed to skip to previous Track in queue for your Room");
//     }
// });

export const roomSkipVote = async (req: Request, res: Response, next: NextFunction) => {
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        logger.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    const cache = req.app.get("cache");

    try {
        const room = await Room.get(roomId, cache);
        const result = await room.voteToSkipCurrentSong(req.cookies.pollifySession, cache);
        if (!result) {
            return res.sendStatus(500);
        }
        res.redirect(`/room/${roomId}`);
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomSkipUnvote = async (req: Request, res: Response, next: NextFunction) => {
    const roomId = req.params.roomId;
    if (roomId === undefined) {
        logger.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID");
        return next();
    }
    const cache = req.app.get("cache");

    try {
        const room = await Room.get(roomId, cache);
        const result = await room.unvoteToSkipCurrentSong(req.cookies.pollifySession, cache);
        if (!result) {
            return res.sendStatus(500).send("Failed to unvote to skip Track in queue for your Room");
        }
        logger.debug(`Successfully unvoted skipped to next track for Room ${room.name}`);
        res.redirect(`/room/${roomId}`);
    } catch (err) {
        res.sendStatus(404);
    }
};

export const roomJoin = (req: Request, res: Response, next: NextFunction) => {
    const roomId = req.body.roomId;
    const cache = req.app.get("cache");

    if (roomId === undefined) {
        logger.error(`Connection to ${roomId} failed`);
        res.sendStatus(400);
        return next();
    }

    const ttl = cache.getTtl(roomId);
    if (ttl === undefined) {  // Undefined means key does not exist
        logger.error(`Attempted to join ${roomId} but room doesn't exist.`);
        res.sendStatus(404);
    } else {  // 0 or timestamp of how long key-value will be in cache
        // save this user to the room's internal user list
        res.redirect(`/room/${roomId}`);
    }
};

export const roomTrackAdd = async (req: Request, res: Response, next: NextFunction) => {  // TODO: Change back to POST
    const roomId = req.params.roomId;
    const trackId = req.params.trackId;
    if (roomId === undefined || trackId === undefined) {
        logger.error(`Connection to ${roomId} failed`);
        res.sendStatus(400).send("Failed to get room ID or track ID for adding track");
        return next();
    }

    const cache = req.app.get("cache");
    try {
        // 1. Get room and spotify instance for this room
        const room = await Room.get(roomId, cache);
        // 2. Construct new Track object with suggestor and populate Track data with getTrackById
        // TODO: Determine suggestor's name and attach it to Track by passing to constructor
        const newTrack = await new Track(new User("Bob")).getTrackById(room.spotify, trackId); // Wait for track to populate data from spotify api with getTrackById
        // 3. Done populating Track!  Now make sure to actually add track to room playlist and redirect back to room after successful queue add
        if (!room.isPlaylistCreated()) {  // Sanity check to ensure the Room actually created a Playlist
            return noRoomPlaylistError(roomId, res, next);
        }

        // 4. Store the populated newTrack Object locally in this room
        const result = room.addTrackToTrackList(newTrack);
        if (!result) {
            // 4.a This track already exists in the playlist
            logger.debug(`Track alreayd existed in playlist. Track=${newTrack.name} Room=${room.name}`);
            return res.redirect(`/room/${room.name}`);
        }

        // 5. Kinda Optional. Now we add new track to spotify playlist (only needs to be done for the next track in queue)
        room.spotify.addTracksToPlaylist(room.playlistId, [newTrack.uri])  // Has 3rd options parameter that allows "position"!
            .then(() => {
                // 4. Successful finish! We added the track to the playlist!
                logger.debug(`Added track ${newTrack.name} to queue for room ${room.name} from suggestor ${newTrack.suggestor}`);
            })
            .catch((err) => {
                // TODO: Notify user we failed to add track to spotify playlist "queue"
                logger.error(`Failed to add track ${newTrack.uri} to playlist for room ${room.name}, likely a spotify API error! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            }
            );

        // 6. Save our room after adding to track list
        await room.save(cache);
        // 7. Return user to room home
        res.redirect(`/room/${room.name}`);
    } catch (err) {
        // Could be Room.get or getTrackById error
        logger.error("Failed to add track to queue!");
        res.status(500).send("Failed to add Track to queue for your Room");
    }
};

export const roomSearch = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const searchQuery = req.body.searchQuery;
    const searchType = req.body.searchType.toLowerCase();

    try {
        // 1. Get room
        const room = await Room.get(roomId, req.app.get("cache"));
        logger.info(`Found Room for search=${room.name}`);

        // 2. Query spotify for results
        const data = await room.spotify.search(searchQuery, [searchType]);

        const searchOutput = [];

        // Detect searchType and handle based on case
        if (searchType == "track") {
            const tracks = data.body.tracks.items;

            // 3.a Manipulate response to an output we are going to display
            for (const track of tracks) {
                const manipulatedTrack = buildTrackView(track, true, true);
                searchOutput.push(manipulatedTrack);
            }
        } else if (searchType == "artist") {
            const artists: SpotifyApi.ArtistObjectFull[] = data.body.artists.items;

            // 3.b Manipulate response to an output we are going to display
            for (const artist of artists) {
                const manipulatedArtist = buildArtistView(artist);
                searchOutput.push(manipulatedArtist);
            }
        } else {
            logger.error(`Unknown searchType=${searchType}, what do we do with search result data!!`);
        }

        // 4. Render search results
        res.render("migrated/searchResults", {
            searchQuery: searchQuery,
            searchType: searchType,
            results: searchOutput,
            room: room,
            roomName: room.name,
            roomUsers: room.getSetAsArray("users")
        });
    } catch (err) {
        // Could be Room.get or spotify.search error
        logger.error(`Failed to search for ${searchQuery}!`);
        res.status(500).send("Failed to add Track to queue for your Room");
    }
};

export const roomTrackRemove = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const trackId = req.params.trackId;
    const cache = req.app.get("cache");

    Room.get(roomId, cache)
        .then((room) => {
            if (!room.isOwner(req.cookies.pollifySession)) {
                return res.sendStatus(403);
            }
            room.removeTrack(trackId, cache, function (err: any, success: boolean) {
                if (err != null) {
                    logger.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    return res.sendStatus(500);
                }
                res.redirect(`/room/${room.name}`);
            });
        })
        .catch((err) => {
            logger.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
        );
};

export const roomRemoveVote = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const trackId = req.body.trackId;
    const cache = req.app.get("cache");
    logger.info(`Voting in ${roomId} for ${trackId} to remove`);

    Room.get(roomId, cache)
        .then((room) => {
            const track = room.findTrack(trackId);
            if (!track) {
                logger.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.voteToRemoveTrack(req.cookies.pollifySession, track, cache, function (err: any, result: boolean) {
                if (err) {
                    logger.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    return res.sendStatus(500);
                }
                res.redirect(`/room/${room.name}`);
            });
        })
        .catch((err) => {
            logger.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
        );
};

export const roomRemoveUnvote = (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const trackId = req.body.trackId;
    const cache = req.app.get("cache");
    logger.info(`Voting in ${roomId} for ${trackId} to remove`);

    Room.get(roomId, cache)
        .then((room) => {
            const track = room.findTrack(trackId);
            if (!track) {
                logger.error(`TrackId=${track.id} doesn't exist`);
                res.sendStatus(404);
            }
            room.unvoteToRemoveTrack(req.cookies.pollifySession, track, cache, function (err: any, success: boolean) {
                if (err != null) {
                    logger.error(`Error saving voted to removed track to room ${roomId}. err=${err} and message=${err.message}`);
                    return res.sendStatus(500);
                }
                res.redirect(`/${room.name}`);
            });
        })
        .catch((err) => {
            logger.error(`${roomId} doesn't exist`);
            res.sendStatus(404);
        }
        );
};

// // TODO: Make powerhour
const powerHour = (req: Request, res: Response) => {
    res.render("index", { title: "Express" });
};

export const roomGetTopSongsForArtist = async (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    const artistId = req.params.artistId;

    try {
        // 1. Get room
        const room = await Room.get(roomId, req.app.get("cache"));
        logger.info(`Found Room for search=${room.name}`);

        // 2. Query spotify for results
        // TODO: Localize to country's top tracks
        const data = await room.spotify.getArtistTopTracks(artistId, "US");
        const tracks = data.body.tracks;

        const searchOutput = [];
        // 3. Build view version of each Track with buildTrackView
        for (const track of tracks) {
            const manipulatedTrack = buildTrackView(track, true, true);
            searchOutput.push(manipulatedTrack);
        }

        // 4. Render search results in JSON
        res.json({ topTrackData: searchOutput });
    } catch (err) {
        // Could be Room.get or spotify.search error
        logger.error(`Failed to get top tracks for artist id=${artistId}!`);
        res.status(500).send("Failed to search for top tracks for artist");
    }
};

export const roomUserRemove = (req: Request, res: Response) => {
    const roomId = req.params.roomId;
    if (req.cookies.pollifySession) {
        const cache = req.app.get("cache");
        Room.get(roomId, cache)
            .then((room) => {
                room.users.delete(req.cookies.pollifySession);
                room.save(cache);
                res.sendStatus(204);
            })
            .catch((err) => {
                res.sendStatus(404);
            });
    }
};
