// const express = require("express");
// const router = express.Router();

import { SPOTIFY_APP_ID, SPOTIFY_APP_SECRET, prod } from "../util/secrets";

import { Request, Response } from "express";
import querystring from "query-string";
import request from "request";

import { Room } from "../models/room";
import { Owner } from "../models/owner";
import { Track } from "../models/track";

// Setup logging
import logger from "../util/logger";
import { User } from "../models/user";
import { exception } from "console";

// Required spotify account scope for pollify
const AUTH_SCOPE = [
    "playlist-read-private",
    "playlist-modify-public",
    "playlist-modify-private",
    "playlist-read-collaborative",
    "user-read-email",
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
    "app-remote-control",
    "streaming",
    "user-library-read"
];

// START CONFIG
const DEV_REDIRECT_URI = "http://localhost:3000/auth/spotify/callback";
const PROD_REDIRECT_URI = "https://pollify-nc.herokuapp.com/auth/spotify/callback";

// Define unique key to store user's auth state into a cookie - can leave as default
const STATE_KEY = "spotify_auth_state";
// END CONFIG

export const loginStartAuth = (req: Request, res: Response) => {
    const state: string = generateRandomString(16);
    res.cookie(STATE_KEY, state);

    // your application requests authorization
    res.redirect("https://accounts.spotify.com/authorize?" +
        querystring.stringify({
            response_type: "code",
            client_id: SPOTIFY_APP_ID,
            scope: AUTH_SCOPE.join(" "),
            redirect_uri: prod ? PROD_REDIRECT_URI : DEV_REDIRECT_URI,
            state: state
        }));
};

interface SpotifyTokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

export const loginAuthCallback = (req: Request, res: Response) => {
    // your application requests refresh and access tokens after checking the state parameter

    const code = req.query.code || null;
    const state = req.query.state || null;
    const storedState = req.cookies ? req.cookies[STATE_KEY] : null;

    if (state === null || state !== storedState) {
        return res.redirect("/#" + querystring.stringify({ error: "state_mismatch" }));
    }

    // Clear user's unique cookie using constant key STATE_KEY
    res.clearCookie(STATE_KEY);

    const authOptions: request.UrlOptions & request.CoreOptions = {
        url: "https://accounts.spotify.com/api/token",
        form: {
            code: code,
            redirect_uri: prod ? PROD_REDIRECT_URI : DEV_REDIRECT_URI,
            grant_type: "authorization_code"
        },
        headers: {
            "Authorization": "Basic " + (new Buffer(SPOTIFY_APP_ID + ":" + SPOTIFY_APP_SECRET).toString("base64"))
        },
        json: true
    };

    request.post(authOptions, function (error, response: request.Response, body: SpotifyTokenResponse) {
        if (!error && response.statusCode === 200) {

            const access_token: string = body.access_token;
            const refresh_token: string = body.refresh_token;

            logger.debug("We did it, successfully ripped an access token from spotify's cold dead hands => " + access_token);

            // TODO: Use spotifySuccessCallback or whatever we need to do with the spotify access token to build a SpotifyWebApi

            const options: request.UrlOptions & request.CoreOptions = {
                url: "https://api.spotify.com/v1/me",
                headers: { "Authorization": "Bearer " + access_token },
                json: true
            };

            // use the access token to access the Spotify Web API
            request.get(options, function (error, response: request.Response, body) {
                logger.debug(`Spotify user info request status code: ${response.statusCode}`);
                logger.debug(`what is our body structure, do we got id and email and username for owner?\n${JSON.stringify(body)}`);

            });

            // TODO: Testing that this will work here:
            spotifyCallbackSuccess(body, req, res);

            // we can also pass the token to the browser to make requests from there
            // res.redirect("/auth/spotify/success#" +
            //     querystring.stringify({
            //         access_token: access_token,
            //         refresh_token: refresh_token
            //     })
            // );
        } else {
            // Redirect somewhere with flag notifying of spotify auth failure/error
            logger.error(`Failed to authenticate with spotify with statusCode -> ${response.statusCode} and error -> ${error}`);
            res.redirect("/#" +
                querystring.stringify({
                    error: "invalid_token"
                })
            );
        }
    });
};


/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
const generateRandomString = (length: number): string => {
    let text = "";
    const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < length; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
};

// TODO: Conflicting global name 'Response' because of express import, so manually renaming Response -> SpotifyResponse for SpotifyApi's unique 'Response' interface
interface SpotifyResponse<T> {
    body: T;
    headers: Record<string, string>;
    statusCode: number;
}

interface SpotifyImage {
    height: number;
    width: number;
    url: string;
}
interface SpotifyUserInfo {
    id: string;  // Same as display_name usually, looks like a username
    email: string;
    display_name: string;
    href: string; // EX: "https://api.spotify.com/v1/users/drutism"
    images: Array<SpotifyImage>;
    type: string; // EX: "user"
    uri: string;  // EX: "spotify:user:drutism"
}

const spotifyCallbackSuccess = async (tokenResponse: SpotifyTokenResponse, req: Request, res: Response) => {
    // Successful authentication, now create room and redirect owner there

    // Calculate when owner's access token will expire with a timestamp
    const tokenExpirationEpoch = new Date();
    tokenExpirationEpoch.setSeconds(tokenExpirationEpoch.getSeconds() + tokenResponse.expires_in);

    logger.debug(`Access Token Expire epoch: ${tokenExpirationEpoch}`);

    const options: request.UrlOptions & request.CoreOptions = {
        url: "https://api.spotify.com/v1/me",
        headers: { "Authorization": "Bearer " + tokenResponse.access_token },
        json: true
    };

    // use the access token to access the Spotify Web API
    request.get(options, async (error, response: request.Response, body: SpotifyUserInfo) => {
        logger.debug(`Returned body from auth check: ${JSON.stringify(body)}`);
        if (error != null) {
            logger.error(`Failed to validate auth token against spotify. Error=${error}`);
            res.redirect("/");
        }

        // Attempt to find session and if it doesn't exist create one for this user
        let pollifySession: string = req.cookies.pollifySession;
        if (!pollifySession) {
            pollifySession = User.createUserSession(req, res).toString();
        }
        const newOwner = new Owner(pollifySession, body.id, body.display_name, body.email, tokenResponse.access_token, tokenResponse.refresh_token, tokenExpirationEpoch);
        const newRoom = new Room(newOwner);

        // Also create spotify playlist for this room
        // I think we can make playlist private because all other user's in room aren't required to login to spotify.
        // They simply use the owner's accessToken, and add/remove tracks with owner's token as well via pollify our software
        if (!prod) {
            // For debugging have a constant room name
            const ROOM_NAME = "extra-small-kiss";
            newRoom.name = ROOM_NAME;
        }
        try {
            // The userId of getUserPlaylists is optional, if nothing is provided it will use the owner's id
            const responseData: SpotifyResponse<SpotifyApi.ListOfUsersPlaylistsResponse> = await newRoom.spotify.getUserPlaylists(newRoom.owner.id);
            const data: SpotifyApi.ListOfUsersPlaylistsResponse = responseData.body;

            let firstInstanceOfPlaylist: SpotifyApi.PlaylistObjectSimplified;
            for (const playlist of data.items) {
                if (playlist.name === newRoom.name) {
                    logger.debug(`Found an instance of playlist: ${playlist.name}`);
                    firstInstanceOfPlaylist = playlist;
                    break;
                }
            }
            if (!firstInstanceOfPlaylist) {
                // the playlist wasn't already found so lets create a new one
                const resp = await newRoom.spotify.createPlaylist(newRoom.owner.id, newRoom.name);
                if (resp.statusCode != 201) {
                    logger.error(`Failed to create new playlist corresponding to the newly created room. OwnerId=${newRoom.owner.id} RoomName=${newRoom.name} Resp=${JSON.stringify( resp)}`);
                    throw exception;
                }
                firstInstanceOfPlaylist = resp.body;
                logger.info(`Created new playlist for the newly created room. PlaylistName=${firstInstanceOfPlaylist.name}`);
            }
            newRoom.playlistId = firstInstanceOfPlaylist.id;

            const playlistTrackDataResponse: SpotifyResponse<SpotifyApi.PlaylistTrackResponse> = await newRoom.spotify.getPlaylistTracks(firstInstanceOfPlaylist.id);
            const playlistTrackData: SpotifyApi.PlaylistTrackResponse = playlistTrackDataResponse.body;
            // Process each track into room's trackList
            for (const outerTrackData of playlistTrackData.items) {
                const track = outerTrackData.track;
                const newTrack = new Track();  // TODO: Suggestor storing in db, then we can know who suggested it in the past
                newTrack.id = track.id;
                newTrack.name = track.name;
                newTrack.album = track.album;
                newTrack.albumImage = track.album.images[0].url; // Biggest Image of Album Art 640x640
                newTrack.artists = track.artists;
                newTrack.artistName = track.artists[0].name;
                newTrack.popularity = track.popularity;
                newTrack.duration_ms = track.duration_ms;
                newTrack.setDuration(newTrack.duration_ms);
                newTrack.uri = track.uri;
                newTrack.track_number = track.track_number;
                newTrack.available_markets = track.available_markets;
                newTrack.explicit = track.explicit;
                newRoom.addTrackToTrackList(newTrack);
            }

            newRoom.save(req.app.get("cache"))
                .then((success) => {
                    logger.info(`Created and saved ${newRoom.name}!!! Redirecting to new room...`);
                    res.redirect(`/room/${newRoom.name}`);
                })
                .catch((err) => {
                    res.sendStatus(404);
                });

            // Set shuffle to false
            // TODO: Capture shuffle state before we change it, then restore after done with pollify
            // TODO: Consider Promise.all to avoid nested promises
            const options: any = {
                state: "false"
            };
            newRoom.spotify.setShuffle(options)
                .then(() => {
                    logger.debug("Turned Shuffle OFF");
                })
                .catch((err) => {
                    logger.error(`Failed to disable Spotify Shuffle, error=${err} and message=${err.message} and stacktrace=${err.stack}`);
                });
        } catch (err) {
            logger.error(`Failed to retrieve playlist with ${newRoom.name}`);
            logger.error(`Error: ${err}`);
            res.redirect("/");
        }
    });
    logger.debug("Finished auth spotify callback");
};