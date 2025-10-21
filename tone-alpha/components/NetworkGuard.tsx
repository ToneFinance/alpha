"use client";

import { useEffect, useRef } from "react";
import { useChainId, useSwitchChain, useAccount } from "wagmi";
import { baseSepolia } from "wagmi/chains";

/**
 * NetworkGuard component ensures users are on the correct network (Base Sepolia).
 * When a wallet is connected on the wrong network, it prompts the user to switch.
 */
export function NetworkGuard() {
  const { isConnected, address } = useAccount();
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    // Reset the prompt flag when user disconnects
    if (!isConnected) {
      hasPromptedRef.current = false;
      return;
    }

    // Check if user is on the wrong network and we haven't prompted yet
    if (
      isConnected &&
      currentChainId !== baseSepolia.id &&
      switchChain &&
      !hasPromptedRef.current
    ) {
      hasPromptedRef.current = true;
      // Prompt user to switch to the correct network
      switchChain({ chainId: baseSepolia.id });
    }
  }, [isConnected, currentChainId, switchChain, address]);

  return null;
}
