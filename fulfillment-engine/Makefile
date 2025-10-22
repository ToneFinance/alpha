GO						:= go

.PHONY: build

build:
	@echo Building binary
	@GOOS=linux GOARCH=amd64 $(GO) build -ldflags="-s -w" -o tone-fulfillment-engine .