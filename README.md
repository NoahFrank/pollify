# Pollify
> Listen to music with your friends through Spotify! Vote or suggest songs to keep the party bumping!

## Running locally
To run this project locally follow these steps:

* First we have to start our db depencencies: `make start-mongo`
* Second we have to copy the .env.example file to .env and update the `SPOTIFY_API_ID` and `SPOTIFY_API_SECRET` values to appropriately login with spotify
* Then we can run the server how ever we wish: `yarn watch`

Then once you are done just run: `make stop-mongo`

## License
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the [MIT](LICENSE.txt) License.
