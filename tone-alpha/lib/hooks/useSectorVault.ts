import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { sectorVaultConfig, sectorTokenConfig, usdcConfig, ABIS } from "../contracts";

/**
 * Hook to read vault data and user balances
 */
export function useSectorVault() {
  const { address } = useAccount();

  // Read user's USDC balance
  const { data: usdcBalance, refetch: refetchUsdcBalance } = useReadContract({
    ...usdcConfig,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read user's sector token balance
  const { data: sectorTokenBalance, refetch: refetchSectorTokenBalance } = useReadContract({
    ...sectorTokenConfig,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read USDC allowance for vault
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    ...usdcConfig,
    functionName: "allowance",
    args: address ? [address, sectorVaultConfig.address] : undefined,
  });

  // Read vault's underlying tokens
  const { data: underlyingTokens } = useReadContract({
    ...sectorVaultConfig,
    functionName: "getUnderlyingTokens",
  });

  // Read vault balances
  const { data: vaultBalances } = useReadContract({
    ...sectorVaultConfig,
    functionName: "getVaultBalances",
  });

  // Read sector token total supply
  const { data: totalSupply } = useReadContract({
    ...sectorTokenConfig,
    functionName: "totalSupply",
  });

  const refetchAll = () => {
    refetchUsdcBalance();
    refetchSectorTokenBalance();
    refetchAllowance();
  };

  return {
    // User balances
    usdcBalance: usdcBalance as bigint | undefined,
    sectorTokenBalance: sectorTokenBalance as bigint | undefined,
    usdcAllowance: usdcAllowance as bigint | undefined,

    // Vault data
    underlyingTokens: underlyingTokens as [string[], bigint[]] | undefined,
    vaultBalances: vaultBalances as [string[], bigint[]] | undefined,
    totalSupply: totalSupply as bigint | undefined,

    // Utility
    refetchAll,
  };
}

/**
 * Hook to handle USDC approval
 */
export function useApproveUsdc() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = (amount: bigint) => {
    writeContract({
      ...usdcConfig,
      functionName: "approve",
      args: [sectorVaultConfig.address, amount],
    });
  };

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
  };
}

/**
 * Hook to handle deposits
 */
export function useDeposit() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

  const deposit = (amount: bigint) => {
    writeContract({
      ...sectorVaultConfig,
      functionName: "deposit",
      args: [amount],
    });
  };

  return {
    deposit,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    receipt,
  };
}

/**
 * Hook to handle withdrawals
 */
export function useWithdraw() {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const withdraw = (amount: bigint) => {
    writeContract({
      ...sectorVaultConfig,
      functionName: "withdraw",
      args: [amount],
    });
  };

  return {
    withdraw,
    hash,
    isPending,
    isConfirming,
    isSuccess,
  };
}

/**
 * Hook to read a specific pending deposit
 */
export function usePendingDeposit(depositId: bigint | undefined) {
  const { data: pendingDeposit } = useReadContract({
    ...sectorVaultConfig,
    functionName: "pendingDeposits",
    args: depositId !== undefined ? [depositId] : undefined,
  });

  return {
    pendingDeposit: pendingDeposit as [string, bigint, boolean, bigint] | undefined,
  };
}

/**
 * Hook to get the next deposit ID (total deposits count)
 */
export function useNextDepositId() {
  const { data: nextDepositId } = useReadContract({
    ...sectorVaultConfig,
    functionName: "nextDepositId",
  });

  return {
    nextDepositId: nextDepositId as bigint | undefined,
  };
}

/**
 * Hook to fetch a single token symbol
 */
export function useTokenSymbol(tokenAddress: string | undefined) {
  const { data: symbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ABIS.ERC20,
    functionName: "symbol",
    query: {
      enabled: !!tokenAddress,
    },
  });

  return symbol as string | undefined;
}

/**
 * Utility function to format token amounts
 */
export function formatTokenAmount(amount: bigint | undefined, decimals = 18): string {
  if (!amount) return "0";
  return formatUnits(amount, decimals);
}

/**
 * Utility function to parse token amounts
 */
export function parseTokenAmount(amount: string, decimals = 18): bigint {
  return parseUnits(amount, decimals);
}
