package main

import (
	"context"
	"crypto/ecdsa"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
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
		"vault_count", len(config.SectorVaults),
	)

	// Connect to Ethereum client (shared across all vaults)
	client, err := ethclient.Dial(config.RPCURL)
	if err != nil {
		Logger.Error("Failed to connect to ethereum client", "error", err)
		os.Exit(1)
	}
	defer client.Close()

	// Parse private key (shared across all vaults)
	privateKey, err := crypto.HexToECDSA(config.PrivateKey[2:]) // Remove 0x prefix
	if err != nil {
		Logger.Error("Invalid private key", "error", err)
		os.Exit(1)
	}

	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		Logger.Error("Cannot assert type: publicKey is not of type *ecdsa.PublicKey")
		os.Exit(1)
	}

	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	Logger.Info("Fulfiller wallet initialized",
		"address", fromAddress.Hex(),
	)

	// Create fulfillers and listeners for each vault
	var fulfillers []*Fulfiller
	var listeners []*EventListener

	for _, vaultConfig := range config.SectorVaults {
		Logger.Info("Initializing vault",
			"vault_name", vaultConfig.Name,
			"vault_address", vaultConfig.Address.Hex(),
		)

		// Create fulfiller for this vault
		fulfiller, err := NewFulfiller(config, vaultConfig, privateKey, fromAddress)
		if err != nil {
			Logger.Error("Failed to create fulfiller",
				"vault_name", vaultConfig.Name,
				"error", err,
			)
			os.Exit(1)
		}
		fulfillers = append(fulfillers, fulfiller)

		// Create event listener for this vault
		listener := NewEventListener(client, config, vaultConfig, fulfiller)
		listeners = append(listeners, listener)
	}

	// Ensure all fulfillers are closed on exit
	defer func() {
		for _, f := range fulfillers {
			f.Close()
		}
	}()

	// Start listening for events
	ctx, cancel := context.WithCancel(context.Background())

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Track listener completion
	var wg sync.WaitGroup
	listenerErr := make(chan error, len(listeners))

	// Start all listeners in goroutines
	for i, listener := range listeners {
		wg.Add(1)
		vaultName := config.SectorVaults[i].Name

		go func(l *EventListener, name string) {
			defer wg.Done()
			Logger.Info("Starting event listener", "vault_name", name)
			if err := l.Start(ctx); err != nil && err != context.Canceled {
				Logger.Error("Listener error", "vault_name", name, "error", err)
				listenerErr <- err
			}
		}(listener, vaultName)
	}

	Logger.Info("All event listeners started successfully")

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
			for _, f := range fulfillers {
				f.Wait()
			}
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

		// Wait for all listeners to stop
		wg.Wait()
		Logger.Info("Fulfillment engine stopped gracefully")

	case err := <-listenerErr:
		cancel()
		Logger.Error("Listener error, shutting down", "error", err)
		// Wait for all listeners to stop before exiting
		wg.Wait()
		os.Exit(1)
	}
}
