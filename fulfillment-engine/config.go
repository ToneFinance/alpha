package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

type Config struct {
	PrivateKey      string
	RPCURL          string
	SectorVault     common.Address
	WETH            common.Address
	UNI             common.Address
	AAVE            common.Address
	PollInterval    int
	LogLevel        string
	LogFormat       string
	ShutdownTimeout time.Duration // Graceful shutdown timeout
}

func LoadConfig() (*Config, error) {
	// Load .env file
	_ = godotenv.Load()

	privateKey := os.Getenv("PRIVATE_KEY")
	if privateKey == "" {
		return nil, fmt.Errorf("PRIVATE_KEY not set")
	}

	rpcURL := os.Getenv("RPC_URL")
	if rpcURL == "" {
		rpcURL = "https://sepolia.base.org"
	}

	sectorVault := os.Getenv("SECTOR_VAULT")
	if sectorVault == "" {
		return nil, fmt.Errorf("SECTOR_VAULT not set")
	}

	weth := os.Getenv("WETH")
	uni := os.Getenv("UNI")
	aave := os.Getenv("AAVE")

	if weth == "" || uni == "" || aave == "" {
		return nil, fmt.Errorf("underlying token addresses not set")
	}

	pollIntervalStr := os.Getenv("POLL_INTERVAL")
	pollInterval := 12 // default
	if pollIntervalStr != "" {
		if val, err := strconv.Atoi(pollIntervalStr); err == nil {
			pollInterval = val
		}
	}

	// Logging configuration
	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "INFO"
	}

	logFormat := os.Getenv("LOG_FORMAT")
	if logFormat == "" {
		logFormat = "TEXT"
	}

	shutdownTimeoutStr := os.Getenv("SHUTDOWN_TIMEOUT")
	shutdownTimeout := 30 * time.Second // default 30 seconds
	if shutdownTimeoutStr != "" {
		if val, err := strconv.Atoi(shutdownTimeoutStr); err == nil && val > 0 {
			shutdownTimeout = time.Duration(val) * time.Second
		}
	}

	return &Config{
		PrivateKey:      privateKey,
		RPCURL:          rpcURL,
		SectorVault:     common.HexToAddress(sectorVault),
		WETH:            common.HexToAddress(weth),
		UNI:             common.HexToAddress(uni),
		AAVE:            common.HexToAddress(aave),
		PollInterval:    pollInterval,
		LogLevel:        logLevel,
		LogFormat:       logFormat,
		ShutdownTimeout: shutdownTimeout,
	}, nil
}
