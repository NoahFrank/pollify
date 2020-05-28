// Setup logging
import logger from "../util/logger";
import { User } from "./user";
import SpotifyWebApi from "spotify-web-api-node";

/**
 * Track is dual-purpose in our pollify application.  It gives a class structure to our locally tracked queue in a room,
 * or trackList.  The second purpose is to also give structure to the slimmed, lite version of a Track that is used for
 * view rendering.  The second view version of Track uses the same attribute names to keep consistency, but may be confusing
 * if you are thinking about Track in terms of its first purpose (see buildTrackView()).
 */
export class Track {
    votedToSkipUsers: Set<string>;  // This is a set of user session key strings
    votedToRemoveUsers: Set<string>; // This is a set of user session key strings
    suggestor: User;
    id: string;
    name: string;
    albumName: string;
    albumImage: string;
    artistName: string;
    popularity: number;
    duration_ms: number;
    type: string;
    rawTrackJson: string;
    uri: string;
    track_number: number;
    available_markets: Array<string>;
    disc_number: number;
    explicit: boolean;
    external_ids: Array<number>;
    external_urls: Array<string>;
    href: string;
    album: SpotifyApi.AlbumObjectSimplified;
    artists: Array<SpotifyApi.ArtistObjectSimplified>;
    users: Array<User>;
    currentUserVotedToRemove: boolean;

    constructor(suggestor?: User) {
        this.votedToSkipUsers = new Set();  // This is a set of user session key strings
        this.votedToRemoveUsers = new Set(); // This is a set of user session key strings
        this.suggestor = suggestor || new User();
        this.id = "";
        this.name = "";
        this.albumName = "";
        this.albumImage = "";
        this.artistName = "";
        this.popularity = -1;
        this.duration_ms = -1;
        this.type = "";
        this.rawTrackJson = null;
        this.uri = "";
        this.track_number = -1;
        this.available_markets = [];
        this.disc_number = -1;
        this.explicit = true;
        this.external_ids = [];
        this.external_urls = [];
        this.href = "";
    }

    static copy(track: Track): Track {
        const deepCopyTrack: Track = (JSON.parse(JSON.stringify(track)));
        deepCopyTrack.votedToSkipUsers = new Set(track.votedToSkipUsers);
        deepCopyTrack.votedToRemoveUsers = new Set(track.votedToRemoveUsers);
        return deepCopyTrack;
    }

    getTrackById(spotify: SpotifyWebApi, trackId: string): Promise<Track> {
        return new Promise((resolve, reject) => {
            spotify.getTrack(trackId).then(track => {
                if (track.statusCode !== 200) {
                    reject(`Status Code was not 200, but instead ${track.statusCode}`);
                }
                this.id = track.body.id;
                this.name = track.body.name;
                this.album = track.body.album;
                this.albumImage = track.body.album.images[0].url; // Biggest Image of Album Art 640x640
                this.artists = track.body.artists;
                this.artistName = track.body.artists[0].name;
                this.popularity = track.body.popularity;
                this.duration_ms = track.body.duration_ms;

                this.uri = track.body.uri;
                this.track_number = track.body.track_number;
                this.available_markets = track.body.available_markets;
                this.explicit = track.body.explicit;
                resolve(this);
            }).catch(err => {
                logger.error(`Failed to capture Track by ID: ${err} and message=${err.message}`);
                reject(`Failed to capture Track by ID: ${err.message}`);
            });
        });
    }

    equals(otherTrack: Track) {
        return this.id == otherTrack.id;
    }

    getUri() {
        if (!this.uri) return "spotify:track:" + this.id;
        return this.uri;
    }
}
