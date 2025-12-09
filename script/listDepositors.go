package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	vaultAddress          = "0x70E6a36bb71549C78Cd9c9f660B0f67B13B3f772"
	depositRequestedTopic = "0x827893a5f98dbfaba92dbe0bb2cafe8b9fd5573711d9768ce5cd4e2af44601ac"
	// Etherscan API v2 unified endpoint
	etherscanAPI = "https://api.etherscan.io/v2/api"
	// Base Sepolia chain ID
	baseSepoliaChainID = "84532"
)

type Deposit struct {
	ID        *big.Int
	User      string
	Amount    *big.Int
	Timestamp *big.Int
}

func queryLogs(apiKey string) ([]map[string]interface{}, error) {
	params := url.Values{}
	params.Add("chainid", baseSepoliaChainID)
	params.Add("module", "logs")
	params.Add("action", "getLogs")
	params.Add("address", vaultAddress)
	params.Add("topic0", depositRequestedTopic)
	params.Add("fromBlock", "0")
	params.Add("toBlock", "latest")
	params.Add("apikey", apiKey)

	fullURL := etherscanAPI + "?" + params.Encode()

	fmt.Printf("Querying Etherscan API v2...\n")
	resp, err := http.Get(fullURL)
	if err != nil {
		return nil, fmt.Errorf("failed to query API: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	// Debug: Check HTTP status
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("API returned HTTP %d: %s", resp.StatusCode, string(body[:min(len(body), 200)]))
	}

	var logResp map[string]interface{}
	if err := json.Unmarshal(body, &logResp); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v (body: %s)", err, string(body[:min(len(body), 200)]))
	}

	if status, ok := logResp["status"].(string); !ok || status != "1" {
		msg := "unknown error"
		if message, ok := logResp["message"].(string); ok {
			msg = message
		}
		return nil, fmt.Errorf("API error: %s", msg)
	}

	// Convert result to logs
	resultInterface := logResp["result"]
	var logs []map[string]interface{}

	if resultArray, ok := resultInterface.([]interface{}); ok {
		for _, logItem := range resultArray {
			if logMap, ok := logItem.(map[string]interface{}); ok {
				logs = append(logs, logMap)
			}
		}
	}

	return logs, nil
}

func main() {
	// Load .env file
	if err := godotenv.Load("../.env"); err != nil {
		log.Printf("Warning: could not load .env file: %v", err)
	}

	apiKey := os.Getenv("BASESCAN_API_KEY")
	if apiKey == "" {
		log.Fatal("BASESCAN_API_KEY not found in environment or .env file")
	}

	logs, err := queryLogs(apiKey)
	if err != nil {
		log.Fatalf("Failed to query logs: %v", err)
	}

	if len(logs) == 0 {
		fmt.Println("=== Tone Finance Depositors ===\n")
		fmt.Println("No deposits found")
		return
	}


	// Parse logs and extract unique depositors
	depositors := make(map[string]bool)
	deposits := make([]Deposit, 0)

	for _, logItem := range logs {
		topics, ok := logItem["topics"].([]interface{})
		if !ok || len(topics) < 2 {
			continue
		}

		data, ok := logItem["data"].(string)
		if !ok {
			continue
		}

		// Extract user address from topic[1] (indexed parameter)
		userTopic, ok := topics[1].(string)
		if !ok {
			continue
		}
		// Topic is already an address (padded to 32 bytes), extract the last 40 hex chars (20 bytes)
		userAddress := "0x" + userTopic[len(userTopic)-40:]

		// Parse data: remove 0x prefix and parse hex
		data = strings.TrimPrefix(data, "0x")
		// Event has 2 uint256 parameters: amount and requestId
		if len(data) < 128 { // 2 * 64 hex chars for 2 uint256 params
			continue
		}

		// amount (first 32 bytes / 64 hex chars)
		amountHex := "0x" + data[0:64]
		amount := new(big.Int)
		amount.SetString(amountHex, 0)

		// requestId (second 32 bytes / 64 hex chars)
		requestIDHex := "0x" + data[64:128]
		requestID := new(big.Int)
		requestID.SetString(requestIDHex, 0)

		// Get timestamp from the log
		timeStampStr, ok := logItem["timeStamp"].(string)
		if !ok {
			continue
		}
		timeStampStr = strings.TrimPrefix(timeStampStr, "0x")
		timestamp := new(big.Int)
		timestamp.SetString(timeStampStr, 16) // Parse as hex

		userLower := strings.ToLower(userAddress)
		depositors[userLower] = true
		deposits = append(deposits, Deposit{
			ID:        requestID,
			User:      userLower,
			Amount:    amount,
			Timestamp: timestamp,
		})
	}

	// Print results
	fmt.Println("=== Tone Finance Depositors ===")
	fmt.Printf("Total deposit requests: %d\n", len(deposits))
	fmt.Printf("Unique depositors: %d\n\n", len(depositors))

	// Print unique depositors list
	fmt.Println("=== Depositor List ===")
	uniqueDepositors := make([]string, 0, len(depositors))
	for addr := range depositors {
		uniqueDepositors = append(uniqueDepositors, addr)
	}
	sort.Strings(uniqueDepositors)

	for i, addr := range uniqueDepositors {
		fmt.Printf("%d. %s\n", i+1, addr)
	}

	// Print deposit details
	fmt.Println("\n=== Deposit Details ===")
	for _, deposit := range deposits {
		// Convert amount from wei to USDC (6 decimals)
		usdcAmount := new(big.Float).Quo(
			new(big.Float).SetInt(deposit.Amount),
			new(big.Float).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(6), nil)),
		)

		// Format timestamp as readable date
		ts := time.Unix(deposit.Timestamp.Int64(), 0).UTC()

		fmt.Printf("Deposit #%s\n", deposit.ID.String())
		fmt.Printf("  User: %s\n", deposit.User)
		fmt.Printf("  Amount: %s USDC\n", usdcAmount.String())
		fmt.Printf("  Timestamp: %s\n", ts.Format("2006-01-02 15:04:05 UTC"))
		fmt.Println()
	}
}
