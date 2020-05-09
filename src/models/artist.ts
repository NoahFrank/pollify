// Setup logging
import logger from "../util/logger";
import SpotifyWebApi from "spotify-web-api-node";

export class Artist {
    id: string;
    name: string;  // Artist full name
    popularity: number;  // Score out of 100
    genres: Array<any>;
    images: Array<any>;  // List of Objects with (height, url, width) attributes
    uri: string;
    href: string;  // Direct spotify link to artist page

    constructor() {
        this.id = "";
        this.name = "";  // Artist full name
        this.popularity = -1;  // Score out of 100
        this.genres = [];

        this.images = [];  // List of Objects with (height, url, width) attributes

        this.uri = "";
        this.href = "";  // Direct spotify link to artist page
    }

    getArtistById(spotify: SpotifyWebApi, artistId: number) {
        return new Promise((resolve, reject) => {
            spotify.getArtist(artistId.toString()).then(artist => {
                if (artist.statusCode !== 200) {
                    reject(`Status Code was not 200, but instead ${artist.statusCode}`);
                }
                this.id = artist.body.id;
                this.name = artist.body.name;
                this.popularity = artist.body.popularity;
                this.genres = artist.body.genres;

                this.images = artist.body.images;

                this.uri = artist.body.uri;
                this.href = artist.body.href;
                resolve(this);
            }).catch(err => {
                logger.error(`Failed to capture Artist by ID: ${err} and message=${err.message}`);
                reject(`Failed to capture Artist by ID: ${err.message}`);
            });
        });
    }
}
