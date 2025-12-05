import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { ABIS } from "../contracts";
import { SectorConfig } from "../sectors";

/**
 * Hook to read vault data and user balances for a specific sector
 */
export function useSectorVault(sector: SectorConfig) {
  const { address } = useAccount();

  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const sectorTokenConfig = {
    address: sector.tokenAddress,
    abi: ABIS.SectorToken,
  } as const;

  const quoteTokenConfig = {
    address: sector.quoteTokenAddress,
    abi: ABIS.ERC20,
  } as const;

  // Read user's quote token (e.g., USDC) balance
  const { data: quoteTokenBalance, refetch: refetchQuoteTokenBalance } = useReadContract({
    ...quoteTokenConfig,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read user's sector token balance
  const { data: sectorTokenBalance, refetch: refetchSectorTokenBalance } = useReadContract({
    ...sectorTokenConfig,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
  });

  // Read quote token allowance for vault
  const { data: quoteTokenAllowance, refetch: refetchAllowance } = useReadContract({
    ...quoteTokenConfig,
    functionName: "allowance",
    args: address ? [address, sector.vaultAddress] : undefined,
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

  // Read total value locked (TVL) in quote token
  const { data: totalValue } = useReadContract({
    ...sectorVaultConfig,
    functionName: "getTotalValue",
  });

  const refetchAll = () => {
    refetchQuoteTokenBalance();
    refetchSectorTokenBalance();
    refetchAllowance();
  };

  return {
    // User balances
    quoteTokenBalance: quoteTokenBalance as bigint | undefined,
    sectorTokenBalance: sectorTokenBalance as bigint | undefined,
    quoteTokenAllowance: quoteTokenAllowance as bigint | undefined,

    // Vault data
    underlyingTokens: underlyingTokens as [string[], bigint[]] | undefined,
    vaultBalances: vaultBalances as [string[], bigint[]] | undefined,
    totalSupply: totalSupply as bigint | undefined,
    totalValue: totalValue as bigint | undefined,

    // Utility
    refetchAll,
  };
}

/**
 * Hook to handle quote token approval for a specific sector
 */
export function useApproveQuoteToken(sector: SectorConfig) {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, status } = useWaitForTransactionReceipt({ hash });
  const isError = status === "error" || !!writeError;

  const quoteTokenConfig = {
    address: sector.quoteTokenAddress,
    abi: ABIS.ERC20,
  } as const;

  const approve = (amount: bigint) => {
    writeContract({
      ...quoteTokenConfig,
      functionName: "approve",
      args: [sector.vaultAddress, amount],
    });
  };

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    isError,
    error: writeError,
  };
}

/**
 * Hook to handle deposits for a specific sector
 */
export function useDeposit(sector: SectorConfig) {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, data: receipt, status } = useWaitForTransactionReceipt({ hash });
  const isError = status === "error" || !!writeError;

  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

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
    isError,
    error: writeError,
  };
}

/**
 * Hook to handle withdrawals for a specific sector
 */
export function useWithdraw(sector: SectorConfig) {
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

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
 * Hook to request USDC withdrawal (two-step process via fulfillment engine)
 */
export function useRequestWithdrawal(sector: SectorConfig) {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const requestWithdrawal = (sharesAmount: bigint) => {
    writeContract({
      ...sectorVaultConfig,
      functionName: "requestWithdrawal",
      args: [sharesAmount],
    });
  };

  return {
    requestWithdrawal,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    writeError,
  };
}

/**
 * Hook to read a specific pending withdrawal for a sector
 */
export function usePendingWithdrawal(sector: SectorConfig, withdrawalId: bigint | undefined) {
  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const { data: pendingWithdrawal, refetch } = useReadContract({
    ...sectorVaultConfig,
    functionName: "pendingWithdrawals",
    args: withdrawalId !== undefined ? [withdrawalId] : undefined,
    query: {
      refetchInterval: 3000, // Poll every 3 seconds
    },
  });

  return {
    pendingWithdrawal: pendingWithdrawal as [string, bigint, boolean, bigint] | undefined,
    refetch,
  };
}

/**
 * Hook to calculate expected USDC value for withdrawing shares
 */
export function useCalculateWithdrawalValue(sector: SectorConfig, sharesAmount: bigint | undefined) {
  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const { data: usdcValue, refetch } = useReadContract({
    ...sectorVaultConfig,
    functionName: "calculateWithdrawalValue",
    args: sharesAmount !== undefined && sharesAmount > 0n ? [sharesAmount] : undefined,
  });

  return {
    usdcValue: usdcValue as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to read a specific pending deposit for a sector
 */
export function usePendingDeposit(sector: SectorConfig, depositId: bigint | undefined) {
  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const { data: pendingDeposit, refetch } = useReadContract({
    ...sectorVaultConfig,
    functionName: "pendingDeposits",
    args: depositId !== undefined ? [depositId] : undefined,
    query: {
      refetchInterval: 3000, // Poll every 3 seconds
    },
  });

  return {
    pendingDeposit: pendingDeposit as [string, bigint, boolean, bigint] | undefined,
    refetch,
  };
}

/**
 * Hook to get the next deposit ID for a sector
 */
export function useNextDepositId(sector: SectorConfig) {
  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const { data: nextDepositId, refetch } = useReadContract({
    ...sectorVaultConfig,
    functionName: "nextDepositId",
    query: {
      refetchInterval: 3000, // Poll every 3 seconds
    },
  });

  return {
    nextDepositId: nextDepositId as bigint | undefined,
    refetch,
  };
}

/**
 * Hook to fetch token metadata (symbol, decimals, name)
 */
export function useTokenMetadata(tokenAddress: string | undefined) {
  const { data: symbol } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ABIS.ERC20,
    functionName: "symbol",
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: decimals } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ABIS.ERC20,
    functionName: "decimals",
    query: {
      enabled: !!tokenAddress,
    },
  });

  const { data: name } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ABIS.ERC20,
    functionName: "name",
    query: {
      enabled: !!tokenAddress,
    },
  });

  return {
    symbol: symbol as string | undefined,
    decimals: decimals as number | undefined,
    name: name as string | undefined,
  };
}

/**
 * Hook to fetch target weight for a specific token in a sector
 */
export function useTargetWeight(sector: SectorConfig, tokenAddress: string | undefined) {
  const sectorVaultConfig = {
    address: sector.vaultAddress,
    abi: ABIS.SectorVault,
  } as const;

  const { data: weight } = useReadContract({
    ...sectorVaultConfig,
    functionName: "targetWeights",
    args: tokenAddress ? [tokenAddress as `0x${string}`] : undefined,
    query: {
      enabled: !!tokenAddress,
    },
  });

  return weight as bigint | undefined;
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

/**
 * Utility function to format token amounts to 2 decimal places with localization
 */
export function formatTokenAmountTo2Decimals(amount: bigint | undefined, decimals = 18): string {
  if (!amount) return "0.00";
  return parseFloat(formatUnits(amount, decimals)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
