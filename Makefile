.PHONY: start-mongo
start-mongo:
	docker run -d --rm -p 27017:27017 --name mongo mongo:latest

.PHONY: stop-mongo
stop-mongo:
	docker stop mongo