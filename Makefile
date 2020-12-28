.PHONY: start-mongo
start-mongo:
	docker run -d --rm -p 27017:27017 --name mongo mongo:latest

.PHONY: stop-mongo
stop-mongo:
	docker stop mongo

.PHONY: build
build:
	docker build -t pollify -f Dockerfile ./

.PHONY: run
run:
	docker run --rm -e MONGODB_URI=$MONGODB_URI -e SPOTIFY_APP_ID=$SPOTIFY_APP_ID -e SPOTIFY_APP_SECRET=$SPOTIFY_APP_ID -e SESSION_SECRET=$SESSION_SECRET pollify