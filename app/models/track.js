const spotify = require('./spotify');

// Setup logging
const log = require('../../config/logger');

class Track {

    constructor (suggestor) {
        this.votes = 0;
        this.suggestor = suggestor;

        this.id = -1;
        this.name = "";
        this.album = "";
        this.artists = "";
        this.popularity = -1;
        this.duration_ms = -1;
        this.type = "";

        this.uri = -1;
        this.track_number = -1;
        this.available_markets = [];
        this.disc_number = -1;
        this.explicit = true;
        this.external_ids = [];
        this.external_urls = [];
        this.href = "";
    }

    getTrackById(trackId) {
        return new Promise( (resolve, reject) => {
            spotify.getTrack(trackId).then( track => {
                if (track.statusCode === 200) {
                    this.id = track.body.id;
                    this.name = track.body.name;
                    this.album = track.body.album;
                    this.albumImage = track.body.album.images[0].url; // Biggest Image of Album Art
                    this.artists = track.body.artists;
                    this.artistName = track.body.artists[0].name;
                    this.popularity = track.body.popularity;
                    this.duration_ms = track.body.duration_ms;

                    this.track_number = track.body.track_number;
                    this.available_markets = track.body.available_markets;
                    this.explicit = track.body.explicit;
                    resolve();
                } else {
                    reject(`Status Code was not 200, but instead ${track.statusCode}`);
                }
            }).catch( err => {
                log.error(`Failed to capture Track by ID: ${err}`);
                reject(`Failed to capture Track by ID: ${err}`);
            });
        });
    }
}

module.exports = Track;
