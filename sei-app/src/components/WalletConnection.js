"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_SEI_CHAIN_ID || "atlantic-2"; // testnet default
const DEFAULT_DENOM = process.env.NEXT_PUBLIC_SEI_DENOM || "usei";

// Optional: comma-separated REST URLs in env to override
const ENV_REST = (process.env.NEXT_PUBLIC_SEI_REST_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function getDefaultRestFallbacks(chainId) {
  if ((chainId || "").toLowerCase().includes("atlantic")) {
    // Sei testnet defaults
    return [
      "https://sei-testnet-api.polkachu.com",
      "https://sei-testnet-rest.brocha.in",
    ];
  }
  // Sei mainnet defaults
  return [
    "https://sei-api.polkachu.com",
    "https://sei.api.kjnodes.com",
  ];
}

function truncateMiddle(value, prefix = 8, suffix = 6) {
  if (!value) return "";
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export default function WalletConnection() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBalance, setWalletBalance] = useState(null);
  const [isFetchingBalance, setIsFetchingBalance] = useState(false);

  const chainId = useMemo(() => DEFAULT_CHAIN_ID, []);
  const denom = useMemo(() => DEFAULT_DENOM, []);

  const fetchBalance = useCallback(async (bech32Address) => {
    if (!bech32Address) return null;
    setIsFetchingBalance(true);
    try {
      const fallbacks = [...ENV_REST, ...getDefaultRestFallbacks(chainId)];
      for (const baseUrl of fallbacks) {
        try {
          const base = baseUrl.replace(/\/$/, "");
          const res = await fetch(`${base}/cosmos/bank/v1beta1/balances/${bech32Address}?pagination.limit=200`, {
            headers: { Accept: "application/json" },
          });
          if (!res.ok) continue;
          const data = await res.json();
          const balances = Array.isArray(data?.balances) ? data.balances : [];
          const coin = balances.find((b) => b.denom === denom);
          if (coin) {
            const amount = Number(coin.amount) / 1_000_000; // usei -> SEI
            setWalletBalance(amount);
            return amount;
          }
          setWalletBalance(0);
          return 0;
        } catch {
          // try next
        }
      }
      throw new Error("All REST endpoints failed");
    } finally {
      setIsFetchingBalance(false);
    }
  }, [denom, chainId]);

  // Check for existing permission on mount
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window === "undefined" || !window.compass) return;
      try {
        const key = await window.compass.getKey(chainId);
        if (key?.bech32Address) {
          setIsConnected(true);
          setWalletAddress(key.bech32Address);
          fetchBalance(key.bech32Address).catch(() => {});
        }
      } catch {
        // not enabled yet
      }
    };
    checkWallet();
  }, [chainId, fetchBalance]);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      if (typeof window === "undefined" || !window.compass) {
        alert("Compass wallet not found. Please install the Compass extension for SEI.");
        return;
      }
      await window.compass.enable(chainId);
      const key = await window.compass.getKey(chainId);
      if (key?.bech32Address) {
        setIsConnected(true);
        setWalletAddress(key.bech32Address);
        await fetchBalance(key.bech32Address);
      }
    } catch (err) {
      console.error("Error connecting Compass wallet:", err);
      alert("Failed to connect to Compass wallet. Please try again.");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = async () => {
    try {
      await window.compass?.disconnect?.(chainId);
    } catch {
      // ignore if unsupported
    }
    setIsConnected(false);
    setWalletAddress("");
    setWalletBalance(null);
  };

  return (
    <div className="hud-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-orbitron text-xl text-drone-highlight mb-1">SEI Wallet</h2>
          <p className="text-xs text-gray-400">Chain: <span className="font-mono">{chainId}</span></p>
        </div>
        {!isConnected ? (
          <button className="btn-drone font-russo" onClick={connectWallet} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        ) : (
          <button className="btn-drone font-russo cursor-pointer" onClick={disconnectWallet}>
            Disconnect
          </button>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <div className="text-sm text-gray-300">
          <span className="text-gray-400">Status:</span> {isConnected ? "Connected" : "Not Connected"}
        </div>
        <div className="text-sm text-gray-300">
          <span className="text-gray-400">Address:</span> {isConnected ? truncateMiddle(walletAddress) : "—"}
        </div>
        <div className="text-sm text-gray-300 flex items-center gap-3">
          <span className="text-gray-400">Balance:</span>
          <span>{walletBalance == null ? (isFetchingBalance ? "Loading..." : "—") : `${walletBalance.toFixed(6)} SEI`}</span>
          {isConnected && (
            <button className="btn-drone font-russo cursor-pointer" onClick={() => fetchBalance(walletAddress)} disabled={isFetchingBalance}>
              {isFetchingBalance ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}



