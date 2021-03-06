const Moniker = require("moniker");
import { Track } from "./track";
import { Owner } from "./owner";
import { Spotify } from "./spotify";
import { UserDocument } from "../models/user";
import SpotifyWebApi from "spotify-web-api-node";
import logger from "../util/logger";

// CONSTANTS
const ADDED_TRACK_KEY = "RecentlyAddedTrackThatNeedsToBeStoredBecauseSpotifyDoesn'tUpdateThatQuick";
// END CONSTANTS

export class Room {
    // TODO check for collision of Moniker name generation, two rooms with same name would likely throw many errors
    name: string;
    owner: Owner;
    playlistId: string;
    // array of track objects that reflects the current top voted songs
    trackList: Array<Track>;
    users: Array<UserDocument>;
    currentPlaybackState: SpotifyApi.CurrentlyPlayingObject;
    votesToSkipCurrentSong: Set<number>;
    // Also create a dedicated instance of SpotifyWebApi to make ALL requests for this Room using the given Owner authorized credentials
    spotify: SpotifyWebApi;
    // Keep track of when the owner is actively using their managed pollify playlist (aka using pollify)
    active: boolean;

    constructor(owner?: Owner) {
        // TODO check for collision of Moniker name generation, two rooms with same name would likely throw many errors
        this.name = Moniker.generator([Moniker.adjective, Moniker.noun]).choose();
        this.playlistId = null;
        // array of track objects that reflects the current top voted songs
        this.trackList = [];
        this.users = [];

        this.currentPlaybackState = null;
        this.votesToSkipCurrentSong = new Set();

        if (owner) {
            this.setOwner(owner);
        }

        // Default to inactive until we determine the Owner has started using pollify to prevent interference with spotify playback
        this.active = false;
    }

    setOwner(owner: Owner) {
        this.owner = owner;
        this.spotify = Spotify.new(owner);
    }

    isPlaylistCreated() {
        return this.playlistId !== null;
    }

    static async get(roomId: string, cache: any): Promise<Room> {
        try {
            const room = await cache.get(roomId);

            if (room === null || room === undefined) {
                // doesn't exist
                throw new Error(`${roomId} doesn't exist`);
            } else {
                logger.info(`Found Room ${room.name}`);
                return room;
            }
        } catch (err) {
            // Always logger error so no need in each catch statement where this is used
            logger.error(`Failed to get roomId=${roomId} from db with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            // Make sure to not negate any custom .catch statements by passing this error down the line
            throw err;  // We can handle this in a Promise.catch or in try-catch block
        }
    }

    async save(cache: any) {
        // before save perform sorting of tracks based on user votes:
        const result = await this.orderSongs();
        // now save
        try {
            // Cache stores (key, value) with set() so we are storing (roomName, roomObject)
            const success = await cache.set(this.name, this);
            return success;
        } catch (err) {
            logger.error(`Failed to save room to db/cache, with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            return false;
        }
    }

    async refreshAccessToken() {
        if (this.owner.tokenExpirationEpoch < new Date()) {  // Check if token has expired!
            logger.info("Token expired, refreshing now...");
            try {
                const data = await this.spotify.refreshAccessToken();
                // Make sure important tokens, etc are updated in db and state
                const tokenExpirationEpoch = new Date();
                tokenExpirationEpoch.setSeconds(tokenExpirationEpoch.getSeconds() + data.body["expires_in"]);

                // TODO: This is scary, types are locking us into RefreshAccessTokenResponse
                this.owner.accessToken = data.body.access_token;
                this.owner.refreshToken = data.body.access_token;

                logger.info(
                    `Refreshed token for room owner's profile_id=${this.owner.id}.
                        It now expires at ${new Date(tokenExpirationEpoch)}!`
                );
            } catch (err) {
                logger.error(`Could not refresh the token! error=${err.message}`);
            }
        }
    }

    findTrack(trackId: string) {
        for (const roomTrack of this.trackList) {
            if (roomTrack.id === trackId) {
                return roomTrack;
            }
        }
        return null;
    }

    addTrackToTrackList(track: Track): boolean {
        // Make sure track is not already in trackList
        if (this.findTrack(track.id)) return false;

        this.trackList.push(track);
        return true;
    }

    removeTrack(trackId: string, cache: any, callback: Function) {
        const trackList = this.trackList;
        let removedTrack;
        for (const [i, roomTrack] of trackList.entries()) {
            if (roomTrack.id === trackId) {
                removedTrack = this.trackList.splice(i, 1);
                break;
            }
        }
        if (removedTrack.length === 1) {
            removedTrack = removedTrack[0];
            // remove the removed track from spotify
            this.spotify.removeTracksFromPlaylist(this.playlistId, [{ uri: removedTrack.getUri() }])
                .then((success) => {
                    this.save(cache)
                        .then((success) => {
                            logger.info(`Successfully saved Room ${this.name} with removed track`);
                            return callback(null, success);
                        })
                        .catch((err) => {
                            logger.error(`Failed to save removed track from playlist. err=${err} and message=${err.message}`);
                            return callback(err, null);
                        }
                        );
                })
                .catch((err) => {
                    logger.error(`Failed to remove track from spotify playlist. err=${err} and message=${err.message}`);
                    return callback(err, null);
                }
                );
        } else {
            return callback(null, true);
        }
    }

    initializeTrackList(track: Track) {
        if (this.findTrack(track.id)) return;

        this.trackList.push(track);
    }

    addTrackVote(sessionId: string, track: Track) {
        if (!track.votedToSkipUsers.has(sessionId)) {
            track.votedToSkipUsers.add(sessionId);
        }
    }

    removeTrackVote(sessionId: string, track: Track) {
        if (track.votedToSkipUsers.has(sessionId)) {
            track.votedToSkipUsers.delete(sessionId);
        }
    }

    async voteToRemoveTrack(sessionId: string, track: Track, cache: any, callback: Function) {
        if (track.votedToRemoveUsers.has(sessionId)) {
            return callback(`User is already voted to remove this track ${track.name}`, false);
        }
        track.votedToRemoveUsers.add(sessionId);
        // This if condition is the skip vote threshold ALGORITHM
        if (Math.floor(track.votedToRemoveUsers.size / this.users.length) > 0.5) {
            const thisRoom = this;
            try {
                this.removeTrack(track.id, cache, callback);
            } catch (err) {
                logger.error(`Failed to perform a community remove! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
        } else {  // Skip vote threshold not met! Just save this room
            this.save(cache)
                .then(() => {
                    logger.debug(`Successfully saved rooms votes to remove of Track ${track.name}`);
                    return callback(null, true);
                })
                .catch((err) => {
                    logger.error(`Failed to save votes to remove of Track ${track.name}. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    return callback(err, null);
                }
                );
        }
    }

    unvoteToRemoveTrack(sessionId: string, track: Track, cache: any, callback: Function) {
        if (!track.votedToRemoveUsers.has(sessionId)) {
            return callback(`User is already not voting for to remove this track ${track.name}`, false);
        }
        track.votedToRemoveUsers.delete(sessionId);
        this.save(cache)
            .then(() => {
                logger.debug(`Successfully unvoted to remove track ${track.name} for Room ${this.name}`);
                return callback(null, true);
            })
            .catch((err) => {
                logger.error(`Failed to unvote to remove track ${track.name}! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return callback(err, null);
            }
            );
    }

    // TODO: Remove this legacy code - make sure UI is getting what it needs in routes.ts
    getSetAsArray(attr: string) {
        return this.users;
    }

    songSort(a: Track, b: Track) {
        if (a.votedToSkipUsers.size > b.votedToSkipUsers.size) {
            return -1;
        }
        if (a.votedToSkipUsers.size < b.votedToSkipUsers.size) {
            return 1;
        }
        // TODO: secondary sort?
        return 0;
    }

    async orderSongs() {
        // Store the first track in queue for equality check and manipulation
        const preSortTrackList = [...this.trackList];
        const upcomingTrackPreSort = this.trackList[1];

        if (!this.trackList.length) {
            logger.warn("WARN: Track list is empty, it cannot be sorted");
            return false;
        }

        // Sort the track list after excluding the current playing song
        const trackListWithoutPlaying = this.trackList.slice(1);
        trackListWithoutPlaying.sort(this.songSort);

        // If we made sorting changes to the FIRST TRACK IN QUEUE, then update playlist in spotify
        if (!trackListWithoutPlaying[0].equals(upcomingTrackPreSort)) {
            // UPDATE SPOTIFY PLAYLIST
            logger.debug("We are updating FIRST TRACK IN QUEUE because it was changed by room's tracklist sort");
            // Need to make sure "this.trackList[0].uri" is populated
            if (this.trackList[0].uri.length == 0) {
                logger.error("First track's uri isn't populated! Huge problem");
                return false;
            }
            try {
                // Find the top track of the track list's index location in the current spotify playlist state
                // preSortTrackList should have the exact state of the room's spotify playlist
                let trackIndex = 0;
                const nextTrackUri = this.trackList[0].uri;
                for (let i = 0; i < preSortTrackList.length; i++) {
                    const track = preSortTrackList[i];
                    if (track.uri == nextTrackUri) {
                        trackIndex = i;
                        break;
                    }
                }
                
                // Reorder the the playlist to move the top track
                await this.spotify.reorderTracksInPlaylist(this.playlistId, trackIndex, 1);
                logger.debug("Successfully reordered new top track to first position in spotify playlist");
            } catch (err) {
                logger.error(`Failed to remove or add a track from room's playlist, error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            }
        }
        return true;
    }

    isOwner(sessionId: string) {
        return this.owner.user.sessionId == +sessionId;
    }

    async getCurrentPlayback(): Promise<SpotifyApi.CurrentlyPlayingObject> {
        // Get room's current playback
        try {
            const playback = await this.spotify.getMyCurrentPlaybackState();
            if (Object.keys(playback.body).length === 0) {
                this.currentPlaybackState = null;
                return this.currentPlaybackState;
            }
            this.currentPlaybackState = playback.body;
            return this.currentPlaybackState;
        } catch (err) {
            logger.error(`Failed to get Room ${this.name}'s current playback state with error=${err} and message=${err.message} and stacktrace=${err.stack}`);
            throw err;
        }
    }

    async updateRoomStatus(currentPlaybackState: SpotifyApi.CurrentlyPlayingObject) {
        if (currentPlaybackState === null) {
            logger.debug("The User currently doesn't have a playback state.");
            this.active = false;
            return;
        }
        if (currentPlaybackState.context === null) {
            logger.debug("Current playback doesn't have a context.");
            this.active = false;
            return;
        }
        logger.info(`Found playback context. Context=${currentPlaybackState.context}`);
        const playlistUriList: Array<string> = currentPlaybackState.context.uri.split(":");
        if (playlistUriList.length > 0) {
            const playlistId: string = playlistUriList[playlistUriList.length - 1];

            // Query spotify api to discover what playlist the owner is currently playing
            const currentlyPlayingPlaylistResponse = await this.spotify.getPlaylist(playlistId);
            const currentlyPlayingPlaylist = currentlyPlayingPlaylistResponse.body;

            // If the current playlist of the Owner is our managed pollify playlist for this room, then room is active!
            if (currentlyPlayingPlaylist.name == this.name) {
                logger.debug("MATCHING PLAYLIST WITH ROOM, CURRENTLY IN POLLIFY GO STATE");
                this.active = true;
            } else {
                logger.debug("MISMATCHING PLAYLIST WITH ROOM, CURRENTLY IN NORMAL USER SPOTIFY STATE");
                this.active = false;
            }
        } else {
            logger.error(`Unable to update room (${this.name}) status`);
            logger.error(`Why would the format 'spotify:playlist:37i9dQZF1E34T4WDQivGe3' ever not have a length of 3 when split by ':', attempting to split -> '${currentPlaybackState.context.uri}'`);
        }
    }

    async voteToSkipCurrentSong(sessionId: number, cache: any) {
        if (this.votesToSkipCurrentSong.has(sessionId)) {
            logger.info("User is already voting for current song");
            return false;
        }
        this.votesToSkipCurrentSong.add(sessionId);
        // This if condition is the skip vote threshold ALGORITHM
        if (Math.floor(this.votesToSkipCurrentSong.size / this.users.length) > 0.5) {
            const thisRoom = this;
            try {
                const context = await this.spotify.skipToNext();
                // Triggered when skipToNext promise resolves
                logger.debug(`Successfully performed a community skip to next track for Room ${this.name}`);
                thisRoom.votesToSkipCurrentSong = new Set();
                thisRoom.save(cache)
                    .then(() => {
                        logger.debug("Successfully reset rooms votes to skip current track");
                        return true;
                    })
                    .catch((err) => {
                        logger.error(`Failed to save reset votes to skip current track. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                        return false;
                    }
                    );
            } catch (err) {
                logger.error(`Failed to perform a community skip! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return false;
            }
        } else {  // Skip vote threshold not met! Just save this room
            this.save(cache)
                .then(() => {
                    logger.debug("Successfully saved rooms votes to skip current track");
                    return true;
                })
                .catch((err) => {
                    logger.error(`Failed to save votes to skip current track. error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                    return false;
                }
                );
        }
    }

    async unvoteToSkipCurrentSong(sessionId: number, cache: any) {
        if (!this.votesToSkipCurrentSong.has(sessionId)) {
            logger.info("User is already not voting for current song");
            return false;
        }
        this.votesToSkipCurrentSong.delete(sessionId);
        this.save(cache)
            .then(() => {
                return true;
            })
            .catch((err) => {
                logger.error(`Failed to unvote skip track in queue! error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                return false;
            }
            );
    }
}
