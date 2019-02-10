// Setup logging
const log = require('../../config/logger');

class Artist {

    constructor () {
        this.id = -1;
        this.name = "";  // Artist full name
        this.popularity = -1;  // Score out of 100
        this.genres = [];

        this.images = [];  // List of Objects with (height, url, width) attributes

        this.uri = "";
        this.href = "";  // Direct spotify link to artist page
    }

    getArtistById(spotify, artistId) {
        return new Promise( (resolve, reject) => {
            spotify.getArtist(artistId).then( artist => {
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
            }).catch( err => {
                log.error(`Failed to capture Artist by ID: ${err} and message=${err.message}`);
                reject(`Failed to capture Artist by ID: ${err.message}`);
            });
        });
    }
}

module.exports = Artist;
