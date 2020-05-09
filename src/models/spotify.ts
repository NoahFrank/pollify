import { Owner } from "./owner";
import logger from "../util/logger";

import SpotifyWebApi from "spotify-web-api-node";

export class Spotify {
    // Create new instance before each request, could be better to store one instance for each Room
    static new(owner: Owner): SpotifyWebApi {
        const spotify: SpotifyWebApi = new SpotifyWebApi({
            accessToken: owner.accessToken,
            refreshToken: owner.refreshToken
            // clientId : appId,
            // clientSecret : appSecret,
            // redirectUri: 'http://localhost:3000/auth/spotify/callback'
        });
        logger.debug(`Created spotify client. spotify=${JSON.stringify(spotify)}`);
        return spotify;
    };
}

