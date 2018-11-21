const appId = require('config').get('appID');
const appSecret = require('config').get('appSecret');
const SpotifyWebApi = require('spotify-web-api-node');

// Setup logging
const log = require('../../config/logger');

// Create new instance before each request, could be better to store one instance for each Room
module.exports = function(owner) {
    return new SpotifyWebApi({
        accessToken: owner.accessToken,
        refreshToken: owner.refreshToken
        // clientId : appId,
        // clientSecret : appSecret,
        // redirectUri: 'http://localhost:3000/auth/spotify/callback'
    });
};
