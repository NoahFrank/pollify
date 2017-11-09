const spotify = require('./spotify');

// Setup logging
const log = require('winston');

class Track {

    constructor (track, suggestor) {
        this.votes = 0;
        this.suggestor = suggestor;

        this.id = track.id;
        this.name = track.name;
        this.album = track.album;
        this.artists = track.artists;
        this.popularity = track.popularity;
        this.duration_ms = track.duration_ms;
        this.type = track.type;

        this.uri = track.uri;
        this.track_number = track.track_number;
        this.available_markets = track.available_markets;
        this.disc_number = track.disc_number;
        this.explicit = track.explicit;
        this.external_ids = track.external_ids;
        this.external_urls = track.external_urls;
        this.href = track.href;
    }

}

module.exports = Track;
