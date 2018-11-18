const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const SpotifyWebApi = require('spotify-web-api-node');

// Setup logging
const log = require('../../config/logger');

// Create new instance before each request, could be better to store one instance for each Room
module.exports = function(owner) {

    if (owner.tokenExpirationEpoch > new Date()) {  // Check if token has expired!
        log.info("Token expired, refreshing now...");
        let spotify = require('../models/spotify')(owner);
        spotify.refreshAccessToken()
            .then( (data) => {
                // Make sure important tokens, etc are updated in db and state
                let tokenExpirationEpoch = new Date().getTime() / 1000 + data.body['expires_in'];
                owner.accessToken = data.body['accessToken'];
                owner.refreshToken = data.body['refreshToken'];


                log.info(
                    `Refreshed token for profile_id=${owner.profileId}. 
                    It now expires in ${Math.floor(tokenExpirationEpoch - new Date().getTime() / 1000)} seconds!`
                );
            }).catch( (err) => {
                log.error('Could not refresh the token!', err.message);
            }
        );
    }

    return new SpotifyWebApi({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken
        // clientId : appId,
        // clientSecret : appSecret,
        // redirectUri: 'http://localhost:3000/auth/spotify/callback'
    });
};
