"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// SEI EVM chain configurations
const SEI_CHAINS = {
  "sei-testnet": {
    chainId: "0x531", // 1329 in hex for SEI testnet
    chainName: "SEI Testnet",
    rpcUrls: ["https://evm-rpc-testnet.sei-apis.com"],
    nativeCurrency: {
      name: "SEI",
      symbol: "SEI",
      decimals: 18,
    },
    blockExplorerUrls: ["https://seistream.app"],
  },
  "sei-mainnet": {
    chainId: "0x531", // 1329 in hex for SEI mainnet 
    chainName: "SEI Network",
    rpcUrls: ["https://evm-rpc.sei-apis.com"],
    nativeCurrency: {
      name: "SEI",
      symbol: "SEI", 
      decimals: 18,
    },
    blockExplorerUrls: ["https://seistream.app"],
  },
};

const DEFAULT_NETWORK = process.env.NEXT_PUBLIC_SEI_NETWORK || "sei-testnet";

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
  const [chainId, setChainId] = useState("");

  const currentNetwork = useMemo(() => SEI_CHAINS[DEFAULT_NETWORK], []);

  const fetchBalance = useCallback(async (address) => {
    if (!address || !window.ethereum) return null;
    setIsFetchingBalance(true);
    try {
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest']
      });
      // Convert from wei to SEI (18 decimals)
      const balanceInSei = parseInt(balance, 16) / Math.pow(10, 18);
      setWalletBalance(balanceInSei);
      return balanceInSei;
    } catch (error) {
      console.error("Error fetching balance:", error);
      setWalletBalance(0);
      return 0;
    } finally {
      setIsFetchingBalance(false);
    }
  }, []);



  // Check for existing connection and network on mount
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window === "undefined" || !window.ethereum) return;
      
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
        
        setChainId(currentChainId);
        
        if (accounts.length > 0) {
          setIsConnected(true);
          setWalletAddress(accounts[0]);
          fetchBalance(accounts[0]).catch(() => {});
        }
      } catch (error) {
        console.error("Error checking wallet:", error);
      }
    };
    checkWallet();
  }, [fetchBalance]);

  // Listen for account and network changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setWalletAddress(accounts[0]);
        fetchBalance(accounts[0]);
        setIsConnected(true);
      } else {
        setIsConnected(false);
        setWalletAddress("");
        setWalletBalance(null);
      }
    };

    const handleChainChanged = (newChainId) => {
      setChainId(newChainId);
      // Refresh balance when network changes
      if (walletAddress) {
        fetchBalance(walletAddress);
      }
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      }
    };
  }, [fetchBalance, walletAddress]);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      if (typeof window === "undefined" || !window.ethereum) {
        alert("MetaMask not found. Please install MetaMask extension.");
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({ 
        method: 'eth_requestAccounts' 
      });
      
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      
      if (accounts.length > 0) {
        setIsConnected(true);
        setWalletAddress(accounts[0]);
        setChainId(currentChainId);
        await fetchBalance(accounts[0]);
      }
    } catch (error) {
      console.error("Error connecting MetaMask:", error);
      if (error.code === 4001) {
        alert("Connection rejected by user.");
      } else {
        alert("Failed to connect to MetaMask. Please try again.");
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setWalletAddress("");
    setWalletBalance(null);
    setChainId("");
  };

  const isOnCorrectNetwork = chainId === currentNetwork.chainId;

  return (
    <div className="hud-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-orbitron text-xl text-drone-highlight mb-1">MetaMask Wallet</h2>
          <p className="text-xs text-gray-400">
            Network: <span className="font-mono">{currentNetwork.chainName}</span>
          </p>
        </div>
        {!isConnected ? (
          <button className="btn-drone font-russo" onClick={connectWallet} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect MetaMask"}
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
        <div className="text-sm text-gray-300">
          <span className="text-gray-400">Chain ID:</span> {chainId ? chainId : "—"}
        </div>
        <div className="text-sm text-gray-300 flex items-center gap-3">
          <span className="text-gray-400">Balance:</span>
          <span>{walletBalance == null ? (isFetchingBalance ? "Loading..." : "—") : `${walletBalance.toFixed(6)} SEI`}</span>
          {isConnected && (
            <button 
              className="btn-drone font-russo cursor-pointer" 
              onClick={() => fetchBalance(walletAddress)} 
              disabled={isFetchingBalance}
            >
              {isFetchingBalance ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}



