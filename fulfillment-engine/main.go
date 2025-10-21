package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	fmt.Println("🚀 TONE Finance - Fulfillment Engine")
	fmt.Println("=====================================\n")

	// Load configuration
	config, err := LoadConfig()
	if err != nil {
		fmt.Printf("❌ Failed to load config: %v\n", err)
		os.Exit(1)
	}

	// Create fulfiller
	fulfiller, err := NewFulfiller(config)
	if err != nil {
		fmt.Printf("❌ Failed to create fulfiller: %v\n", err)
		os.Exit(1)
	}
	defer fulfiller.Close()

	// Create event listener
	listener := NewEventListener(fulfiller.client, config, fulfiller)

	// Start listening for events
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-sigChan
		fmt.Println("\n\n🛑 Shutting down gracefully...")
		cancel()
	}()

	// Start the listener
	if err := listener.Start(ctx); err != nil && err != context.Canceled {
		fmt.Printf("❌ Listener error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("👋 Fulfillment engine stopped")
}
