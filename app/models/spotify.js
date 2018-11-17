const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const SpotifyWebApi = require('spotify-web-api-node');

// Setup logging
const log = require('../../config/logger');

// Create new instance before each request, could be better to store one instance for each Room
module.exports = function(owner) {

    if (owner.tokenExpirationEpoch > new Date()) {  // Check if token has expired!
        log.error("Token expired");
        // spotify.refreshAccessToken().then(
        //     function(data) {
        //         let tokenExpirationEpoch =
        //             new Date().getTime() / 1000 + data.body['expires_in'];
        //         log.info(
        //             'Refreshed token. It now expires in ' +
        //             Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000) +
        //             ' seconds!'
        //         );
        //     },
        //     function(err) {
        //         log.error('Could not refresh the token!', err.message);
        //     }
        // );
    }

    return new SpotifyWebApi({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken
        // clientId : appId,
        // clientSecret : appSecret,
        // redirectUri: 'http://localhost:3000/auth/spotify/callback'
    });
};
