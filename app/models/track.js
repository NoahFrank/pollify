// Setup logging
const log = require('../../config/logger');

/**
 * Track is dual-purpose in our pollify application.  It gives a class structure to our locally tracked queue in a room,
 * or trackList.  The second purpose is to also give structure to the slimmed, lite version of a Track that is used for
 * view rendering.  The second view version of Track uses the same attribute names to keep consistency, but may be confusing
 * if you are thinking about Track in terms of its first purpose (see buildTrackView()).
 */
class Track {

    constructor (suggestor) {
        this.votes = 0;
        this.users = new Set();  // This is a set of user session key strings
        this.suggestor = suggestor;

        this.id = -1;
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

    getTrackById(spotify, trackId) {
        return new Promise( (resolve, reject) => {
            spotify.getTrack(trackId).then( track => {
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
            }).catch( err => {
                log.error(`Failed to capture Track by ID: ${err} and message=${err.message}`);
                reject(`Failed to capture Track by ID: ${err.message}`);
            });
        });
    }

    equals(otherTrack) {
        return this.id == otherTrack.id;
    }
}

module.exports = Track;
