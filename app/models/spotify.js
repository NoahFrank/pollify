const token = require('config').get('token');
const SpotifyWebApi = require('spotify-web-api-node');

// Setup and authorize spotify API
let spotify = new SpotifyWebApi();
spotify.setAccessToken(token);

module.exports = spotify;
