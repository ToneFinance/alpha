package main

import (
	"context"
	"os"
	"os/signal"
	"sync"
	"syscall"
)

func main() {
	// Load configuration first (before logging is initialized)
	config, err := LoadConfig()
	if err != nil {
		// Can't use logger yet, use stderr
		os.Stderr.WriteString("Failed to load config: " + err.Error() + "\n")
		os.Exit(1)
	}

	// Initialize logger with configuration
	InitLogger(config.LogLevel, config.LogFormat)

	Logger.Info("TONE Finance - Fulfillment Engine starting",
		"log_level", config.LogLevel,
		"log_format", config.LogFormat,
	)

	// Create fulfiller
	fulfiller, err := NewFulfiller(config)
	if err != nil {
		Logger.Error("Failed to create fulfiller", "error", err)
		os.Exit(1)
	}
	defer fulfiller.Close()

	// Create event listener
	listener := NewEventListener(fulfiller.client, config, fulfiller)

	// Start listening for events
	ctx, cancel := context.WithCancel(context.Background())

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Track listener completion
	var wg sync.WaitGroup
	wg.Add(1)
	listenerErr := make(chan error, 1)

	// Start listener in goroutine
	go func() {
		defer wg.Done()
		if err := listener.Start(ctx); err != nil && err != context.Canceled {
			listenerErr <- err
		}
	}()

	// Wait for shutdown signal or listener error
	select {
	case <-sigChan:
		Logger.Info("Shutdown signal received, initiating graceful shutdown",
			"shutdown_timeout", config.ShutdownTimeout,
		)

		// Cancel context to stop listener polling
		cancel()

		// Create shutdown context with timeout
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), config.ShutdownTimeout)
		defer shutdownCancel()

		// Wait for in-flight fulfillments with timeout
		shutdownComplete := make(chan struct{})
		go func() {
			Logger.Info("Waiting for in-flight fulfillments to complete")
			fulfiller.Wait()
			close(shutdownComplete)
		}()

		select {
		case <-shutdownComplete:
			Logger.Info("All in-flight fulfillments completed")
		case <-shutdownCtx.Done():
			Logger.Warn("Shutdown timeout reached, forcing exit",
				"timeout", config.ShutdownTimeout,
			)
		}

		// Wait for listener to stop
		wg.Wait()
		Logger.Info("Fulfillment engine stopped gracefully")

	case err := <-listenerErr:
		cancel()
		Logger.Error("Listener error, shutting down", "error", err)
		os.Exit(1)
	}
}
