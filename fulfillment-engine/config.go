package main

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

type VaultConfig struct {
	Address common.Address
	Name    string
}

type Config struct {
	PrivateKey      string
	RPCURL          string
	SectorVaults    []VaultConfig
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

	// Support both legacy SECTOR_VAULT (single) and new SECTOR_VAULTS (multiple)
	var vaults []VaultConfig

	// Check for new multi-vault format first: SECTOR_VAULTS=addr1,addr2,addr3
	sectorVaultsStr := os.Getenv("SECTOR_VAULTS")
	if sectorVaultsStr != "" {
		addresses := strings.Split(sectorVaultsStr, ",")
		for i, addr := range addresses {
			addr = strings.TrimSpace(addr)
			if addr != "" {
				vaults = append(vaults, VaultConfig{
					Address: common.HexToAddress(addr),
					Name:    fmt.Sprintf("Vault-%d", i+1),
				})
			}
		}
	}

	// Check for named vaults: SECTOR_VAULT_AI=0x..., SECTOR_VAULT_MIA=0x...
	vaultNames := []string{"AI", "MIA", "DEFI", "GAMING", "MEME"} // Common sector names
	for _, name := range vaultNames {
		envKey := fmt.Sprintf("SECTOR_VAULT_%s", name)
		if addr := os.Getenv(envKey); addr != "" {
			vaults = append(vaults, VaultConfig{
				Address: common.HexToAddress(addr),
				Name:    name,
			})
		}
	}

	// Fallback to legacy single vault format
	if len(vaults) == 0 {
		sectorVault := os.Getenv("SECTOR_VAULT")
		if sectorVault == "" {
			return nil, fmt.Errorf("no sector vaults configured - set SECTOR_VAULTS, SECTOR_VAULT_<NAME>, or SECTOR_VAULT")
		}
		vaults = append(vaults, VaultConfig{
			Address: common.HexToAddress(sectorVault),
			Name:    "Default",
		})
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
		SectorVaults:    vaults,
		PollInterval:    pollInterval,
		LogLevel:        logLevel,
		LogFormat:       logFormat,
		ShutdownTimeout: shutdownTimeout,
	}, nil
}
