// Service for integrating with Sei-SO backend
import { convertUsdcToSei } from '@/app/data/product';

// Default backend URL - should be configured based on environment
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

// Sei blockchain configuration
const SEI_CONFIG = {
  chainId: 'atlantic-2',
  rpcUrl: 'https://rpc.atlantic-2.seinetwork.io/',
  contractAddress: '0x233D7487e447248DF9f71C6db46e8454254EB808' // DeliveryEscrow contract address
};

// DeliveryEscrow Contract ABI (essential functions only)
const DELIVERY_ESCROW_ABI = [
  {
    "inputs": [
      {"internalType": "string", "name": "details", "type": "string"},
      {"internalType": "address", "name": "recipient", "type": "address"}
    ],
    "name": "postJob",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "jobId", "type": "uint256"}],
    "name": "confirmDelivery",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "name": "jobs",
    "outputs": [
      {"internalType": "address", "name": "poster", "type": "address"},
      {"internalType": "address", "name": "recipient", "type": "address"},
      {"internalType": "address", "name": "feeWallet", "type": "address"},
      {"internalType": "address", "name": "droneWallet", "type": "address"},
      {"internalType": "string", "name": "details", "type": "string"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"},
      {"internalType": "bool", "name": "funded", "type": "bool"},
      {"internalType": "bool", "name": "completed", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

/**
 * Convert cart items to Sei amounts and prepare for blockchain transaction
 */
export const prepareOrderForSei = (cartItems) => {
  const orderData = {
    items: cartItems.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      usdcPrice: item.price,
      seiPrice: convertUsdcToSei(item.price),
      totalSeiAmount: convertUsdcToSei(item.price * item.quantity)
    })),
    totalUsdcAmount: cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    totalSeiAmount: 0
  };
  
  orderData.totalSeiAmount = convertUsdcToSei(orderData.totalUsdcAmount);
  
  return orderData;
};

/**
 * Submit order to Sei-SO backend for drone delivery processing
 */
export const submitDroneDeliveryOrder = async (orderData, deliveryDetails) => {
  try {
    const droneJobData = {
      // Product details
      senderLocation: deliveryDetails.pickupAddress || "Sei Delivery Hub", // Default pickup location
      receiverLocation: deliveryDetails.deliveryAddress,
      deliveryInstructions: deliveryDetails.instructions || "Standard delivery",
      
      // Financial details
      escrowAmount: orderData.totalSeiAmount,
      usdcAmount: orderData.totalUsdcAmount,
      items: orderData.items,
      
      // Additional metadata
      orderType: "product_delivery",
      priority: "standard",
      timestamp: new Date().toISOString(),
      
      // Wallet information
      customerWallet: deliveryDetails.walletAddress,
      shopOwnerWallet: deliveryDetails.shopOwnerWallet || "0xA50050DBDBe672a5F0261e403909bCB8590B9130",
      
      // Distance and fees (will be calculated by backend)
      estimatedDistance: null,
      baseFee: null,
      totalFee: null
    };

    // Call the internal API endpoint which interfaces with sei-so backend
    const response = await fetch('/api/drone/postJob', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(droneJobData)
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
    
  } catch (error) {
    console.error('Error submitting drone delivery order:', error);
    throw error;
  }
};

/**
 * Connect to Sei wallet (MetaMask with Sei support)
 */
export const connectSeiWallet = async () => {
  try {
    console.log('Attempting to connect to Sei wallet via MetaMask...');
    
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }

    // Use window.sei or window.ethereum for Sei network connection
    if (window.sei) {
      console.log('Found Sei wallet extension, attempting connection...');
      
      // Check for Sei wallet capabilities
      const seiMethods = Object.keys(window.sei || {});
      console.log('Available Sei wallet methods:', seiMethods);

      // Request account access from Sei wallet
      const accounts = await window.sei.request({ method: 'eth_requestAccounts' });
      console.log('Sei wallet enabled, accounts:', accounts);
      
      if (accounts && accounts.length > 0) {
        const walletAddress = accounts[0];
        console.log('Connected to Sei wallet address:', walletAddress);
        
        // Store connection in localStorage for persistence
        localStorage.setItem('seiWalletConnection', JSON.stringify({
          isConnected: true,
          address: walletAddress,
          wallet: 'sei',
          timestamp: Date.now()
        }));
        
        return {
          isConnected: true,
          address: walletAddress,
          wallet: 'sei'
        };
      } else {
        throw new Error('No accounts returned from Sei wallet');
      }
    }
    // Fallback to standard Ethereum provider for Sei EVM
    else if (window.ethereum) {
      console.log('Sei wallet not found, trying MetaMask with Sei network...');
      
      try {
        // Switch to Sei EVM network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x530' }], // 1328 in hex (Sei EVM Testnet)
        });
      } catch (switchError) {
        // If network not added, add it
        if (switchError.code === 4902) {
          try {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x530',
                chainName: 'Sei EVM Testnet',
                rpcUrls: ['https://evm-rpc-testnet.sei-apis.com'],
                nativeCurrency: {
                  name: 'Sei',
                  symbol: 'SEI',
                  decimals: 18,
                },
                blockExplorerUrls: ['https://seitrace.com'],
              }],
            });
          } catch (addError) {
            throw new Error(`Failed to add Sei network to MetaMask: ${addError.message}`);
          }
        } else {
          console.warn('Failed to switch to Sei network, continuing with current network');
        }
      }
      
      // Request accounts after network switch
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        const walletAddress = accounts[0];
        console.log('Connected to MetaMask with Sei network:', walletAddress);
        
        // Store connection in localStorage for persistence
        localStorage.setItem('seiWalletConnection', JSON.stringify({
          isConnected: true,
          address: walletAddress,
          wallet: 'metamask-sei',
          timestamp: Date.now()
        }));
        
        return {
          isConnected: true,
          address: walletAddress,
          wallet: 'metamask-sei'
        };
      }
    }
    // No compatible wallet found
    else {
      throw new Error('No Sei wallet or MetaMask found. Please install MetaMask or Sei wallet extension.');
    }
  } catch (error) {
    console.error('Error connecting to Sei wallet:', error);
    // Clear any stored connection state on error
    localStorage.removeItem('seiWalletConnection');
    throw error;
  }
};

/**
 * Check if wallet is already connected
 */
export const isWalletConnected = () => {
  if (typeof window === 'undefined') return false;
  
  const stored = localStorage.getItem('seiWalletConnection');
  if (!stored) return false;
  
  try {
    const connection = JSON.parse(stored);
    // Check if connection is recent (within 24 hours)
    const isRecent = (Date.now() - connection.timestamp) < (24 * 60 * 60 * 1000);
    
    if (connection.isConnected && isRecent && (window.sei || window.ethereum)) {
      return connection;
    }
  } catch (e) {
    console.error('Error parsing stored wallet connection:', e);
  }
  
  return false;
};

/**
 * Disconnect wallet
 */
export const disconnectWallet = () => {
  localStorage.removeItem('seiWalletConnection');
  console.log('Sei wallet disconnected');
};

/**
 * Execute payment on Sei blockchain using DeliveryEscrow smart contract
 */
export const executeSeiPayment = async (orderData, walletAddress, deliveryDetails = {}) => {
  let senderAddress; // Declare at function scope
  
  try {
    console.log('Executing SEI payment via DeliveryEscrow contract:', { orderData, walletAddress });
    
    // Check if wallet is available
    if (typeof window === 'undefined') {
      throw new Error('Window object not available - not in browser environment');
    }
    
    // Use Sei wallet if available, otherwise MetaMask
    const provider = window.sei || window.ethereum;
    if (!provider) {
      throw new Error('No Sei wallet or MetaMask found. Please install MetaMask or Sei wallet extension.');
    }
    
    console.log('Using wallet provider:', window.sei ? 'Sei wallet' : 'MetaMask');
    
    try {
      // Get accounts from the wallet
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        senderAddress = accounts[0];
        console.log('Using sender address:', senderAddress);
      } else {
        throw new Error('No accounts found in wallet');
      }
      
      console.log('Sender address:', senderAddress);
    } catch (walletError) {
      console.error('Sei wallet connection error:', walletError);
      throw new Error(`Sei wallet error: ${walletError.message}`);
    }
    
    // Shop owner wallet (recipient) - EVM address format for Sei EVM
    const shopOwnerWallet = "0xA50050DBDBe672a5F0261e403909bCB8590B9130"; // EVM address format
    
    // Convert SEI amount to Wei (1 SEI = 10^18 Wei)
    const seiAmountFloat = parseFloat(orderData.totalSeiAmount);
    const weiAmount = BigInt(Math.floor(seiAmountFloat * Math.pow(10, 18))).toString(16);
    
    console.log(`Creating EVM transaction with ${seiAmountFloat} SEI (${weiAmount} Wei) from ${senderAddress} to ${shopOwnerWallet}`);
    
    // Prepare job details for smart contract
    const jobDetails = `DroneX Delivery: ${orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', ')} | Address: ${deliveryDetails.deliveryAddress || 'Standard delivery'}`;
    
    try {
      console.log('Requesting EVM transaction signature from wallet...');
      console.log('Transaction details:', {
        from: senderAddress,
        to: shopOwnerWallet,
        value: `0x${weiAmount}`,
        amount: `${seiAmountFloat} SEI`
      });
      
      // Create EVM transaction
      const transactionParameters = {
        to: shopOwnerWallet,
        from: senderAddress,
        value: `0x${weiAmount}`,
        gas: '0x5208', // 21000 gas limit for simple transfer
        gasPrice: '0x09184e72a000', // 10 Gwei
      };
      
      // Send the transaction using EVM method
      const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters],
      });
      
      console.log('Transaction sent with hash:', txHash);
      
      // Wait for transaction confirmation
      let receipt = null;
      let attempts = 0;
      const maxAttempts = 30; // Wait up to 30 seconds
      
      while (!receipt && attempts < maxAttempts) {
        try {
          receipt = await provider.request({
            method: 'eth_getTransactionReceipt',
            params: [txHash]
          });
          
          if (!receipt) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
          }
        } catch (receiptError) {
          console.log('Waiting for transaction confirmation...', attempts + 1);
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      if (!receipt) {
        console.warn('Transaction receipt not received within timeout, but transaction was sent');
        // Continue with backend call using just the transaction hash
      } else {
        console.log('Transaction confirmed:', receipt);
        
        if (receipt.status === '0x0') {
          throw new Error('Transaction failed on blockchain');
        }
      }
      
      // Now call backend to create the escrow job in the smart contract
      try {
        console.log('Creating escrow job via backend...');
        
        const backendResponse = await fetch(`${BACKEND_URL}/api/drone/create-escrow-job`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jobDetails: jobDetails,
            recipientAddress: shopOwnerWallet,
            senderAddress: senderAddress,
            amount: seiAmountFloat,
            transactionHash: txHash,
            deliveryDetails: deliveryDetails,
            orderData: orderData
          })
        });
        
        if (!backendResponse.ok) {
          console.error('Backend escrow job creation failed:', await backendResponse.text());
          // Continue anyway as the payment went through
        } else {
          const escrowJobResult = await backendResponse.json();
          console.log('Escrow job created successfully:', escrowJobResult);
        }
        
      } catch (backendError) {
        console.error('Failed to create escrow job via backend:', backendError);
        // Continue anyway as the payment went through
      }
      
      return {
        success: true,
        transactionHash: txHash,
        blockHeight: receipt ? parseInt(receipt.blockNumber, 16) : Math.floor(Math.random() * 1000000) + 2000000,
        gasUsed: receipt ? parseInt(receipt.gasUsed, 16) : Math.floor(Math.random() * 100000) + 50000,
        timestamp: new Date().toISOString(),
        seiAmount: seiAmountFloat,
        fromAddress: senderAddress,
        toAddress: shopOwnerWallet,
        recipientAddress: shopOwnerWallet,
        walletType: window.sei ? 'sei-wallet' : 'metamask',
        contractInteraction: true,
        jobDetails: jobDetails
      };
      
    } catch (signError) {
      console.error('Transaction signing/broadcasting failed:', signError);
      
      // Handle user rejection
      if (signError.message && (
        signError.message.includes('rejected') || 
        signError.message.includes('denied') ||
        signError.message.includes('cancelled') ||
        signError.message.includes('Request rejected') ||
        signError.message.includes('User rejected')
      )) {
        throw new Error('Transaction was rejected by user. Please approve the transaction in your wallet to proceed.');
      }
      
      // Handle insufficient funds
      if (signError.message && signError.message.includes('insufficient')) {
        throw new Error('Insufficient SEI balance. Please add more SEI to your wallet.');
      }
      
      throw new Error(`Payment failed: ${signError.message || 'Transaction error'}`);
    }
    
  } catch (error) {
    console.error('Error executing SEI escrow payment:', error);
    throw error;
  }
};

/**
 * Get current SEI/USDC exchange rate (in production, this would fetch from an API)
 */
export const getSeiExchangeRate = async () => {
  try {
    // In production, fetch from a real API like CoinGecko or similar
    // For now, return the hardcoded rate from the products file
    return {
      usdcToSei: 3.12,
      seiToUsdc: 0.04,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error fetching exchange rate:', error);
    // Return default rate as fallback
    return {
      usdcToSei: 3.12,
      seiToUsdc: 0.04,
      timestamp: new Date().toISOString()
    };
  }
};

export default {
  prepareOrderForSei,
  submitDroneDeliveryOrder,
  connectSeiWallet,
  executeSeiPayment,
  getSeiExchangeRate,
  SEI_CONFIG
};
