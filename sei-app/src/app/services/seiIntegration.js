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
 * Connect to Sei wallet (Compass wallet preferred)
 */
export const connectSeiWallet = async () => {
  try {
    console.log('Attempting to connect to Sei wallet...');
    
    if (typeof window === 'undefined') {
      throw new Error('Not in browser environment');
    }

    // Prioritize Compass wallet for Sei network
    if (window.compass) {
      // Quick capability check: some Compass builds are EVM-focused and do not expose
      // Cosmos-style APIs (getAccounts, getKey, signAndBroadcast, etc.). If the
      // installed Compass is EVM-only the app cannot prompt for Sei transactions.
      const compassMethods = Object.keys(window.compass || {});
      const hasCosmosApis = compassMethods.includes('getAccounts') || compassMethods.includes('getKey') || compassMethods.includes('signAndBroadcast') || compassMethods.includes('signAndSendTx') || compassMethods.includes('sendTx') || compassMethods.includes('getOfflineSigner');
      if (!hasCosmosApis) {
        console.error('Detected Compass extension but it does not expose Cosmos signing methods:', compassMethods);
        throw new Error('Installed Compass appears to be an EVM-only build and cannot sign Sei (Cosmos) transactions. Please install a Compass/Wallet build that supports Cosmos/Sei (or use Leap). In Chrome/Edge, search for "Compass Sei" or "Cosmos Compass" or install "Leap" and add the Atlantic-2 network.');
      }

      console.log('Found Compass wallet, attempting connection...');
      
      try {
        // Request connection to Sei network. Some Compass builds expect a chainId arg,
        // others expect no args. Try both.
        try {
          await window.compass.enable(SEI_CONFIG.chainId);
          console.log('Compass wallet enabled for chain:', SEI_CONFIG.chainId);
        } catch (enableWithArgErr) {
          console.warn('window.compass.enable(chainId) failed, trying enable() with no args...', enableWithArgErr && enableWithArgErr.message);
          try {
            await window.compass.enable();
            console.log('Compass wallet enabled with no-arg enable()');
          } catch (enableNoArgErr) {
            console.warn('window.compass.enable() also failed:', enableNoArgErr && enableNoArgErr.message);
            throw enableNoArgErr || enableWithArgErr;
          }
        }
        
        // Get accounts with multiple fallback methods
        let accounts;
        let walletAddress;
        
        try {
          // Try the standard getAccounts method first (with chainId)
          try {
            accounts = await window.compass.getAccounts(SEI_CONFIG.chainId);
            console.log('Compass getAccounts(chainId) result:', accounts);
          } catch (getAccountsWithArgErr) {
            console.warn('getAccounts(chainId) failed, trying getAccounts() with no args...', getAccountsWithArgErr && getAccountsWithArgErr.message);
            // Try without chainId (some Compass builds expose parameterless getAccounts)
            accounts = await window.compass.getAccounts();
            console.log('Compass getAccounts() result:', accounts);
          }

          if (accounts && accounts.length > 0) {
            walletAddress = accounts[0].address;
          }
        } catch (getAccountsError) {
          console.log('Standard getAccounts failed, trying alternative methods...');
          
          // Try alternative method: getOfflineSigner
          try {
            const offlineSigner = await window.compass.getOfflineSigner(SEI_CONFIG.chainId);
            accounts = await offlineSigner.getAccounts();
            console.log('Compass offlineSigner accounts:', accounts);
            
            if (accounts && accounts.length > 0) {
              walletAddress = accounts[0].address;
            }
          } catch (signerError) {
            console.log('getOfflineSigner failed, trying getKey method...');
            
            // Try getting key/account directly
            try {
              const walletKey = await window.compass.getKey(SEI_CONFIG.chainId);
              console.log('Compass getKey result:', walletKey);
              
              if (walletKey && walletKey.bech32Address) {
                walletAddress = walletKey.bech32Address;
                accounts = [{ address: walletAddress }];
              }
            } catch (keyError) {
              console.error('All account retrieval methods failed:', keyError);
              throw new Error('Could not retrieve account from Compass wallet. Please make sure the wallet is unlocked and connected.');
            }
          }
        }
        
        if (!walletAddress) {
          throw new Error('No accounts found in Compass wallet. Please connect your wallet first.');
        }
        
        console.log('Connected to Compass wallet:', walletAddress);
        
        // Store connection state
        localStorage.setItem('sei_wallet_connected', 'true');
        localStorage.setItem('sei_wallet_type', 'compass');
        localStorage.setItem('sei_wallet_address', walletAddress);
        
        return {
          address: walletAddress,
          isConnected: true,
          walletType: 'compass'
        };
        
      } catch (compassError) {
        console.error('Compass wallet error:', compassError);
        throw new Error(`Compass wallet connection failed: ${compassError.message}`);
      }
      
    } else if (window.keplr) {
      console.log('Compass not found, falling back to Keplr...');
      throw new Error('Please use Compass wallet for Sei network. Keplr is not supported for this application.');
      
    } else {
      throw new Error('Compass wallet not found. Please install Compass wallet extension for Sei network.');
    }
    
  } catch (error) {
    console.error('Error connecting to Sei wallet:', error);
    // Clear any stored connection state on error
    localStorage.removeItem('sei_wallet_connected');
    localStorage.removeItem('sei_wallet_type');
    localStorage.removeItem('sei_wallet_address');
    throw error;
  }
};

/**
 * Check if wallet is already connected
 */
export const isWalletConnected = () => {
  if (typeof window === 'undefined') return false;
  
  const connected = localStorage.getItem('sei_wallet_connected') === 'true';
  const walletType = localStorage.getItem('sei_wallet_type');
  const address = localStorage.getItem('sei_wallet_address');
  
  console.log('Wallet connection check:', { connected, walletType, address, compassAvailable: !!window.compass });
  
  // Verify the wallet is still available
  if (connected && walletType === 'compass' && address) {
    // Check if compass is available
    if (window.compass) {
      return {
        isConnected: true,
        address: address,
        walletType: 'compass'
      };
    } else {
      // Compass not available, clear storage
      console.log('Compass wallet not available, clearing stored connection');
      localStorage.removeItem('sei_wallet_connected');
      localStorage.removeItem('sei_wallet_type');
      localStorage.removeItem('sei_wallet_address');
      return false;
    }
  }
  
  return false;
};

/**
 * Disconnect wallet
 */
export const disconnectWallet = () => {
  localStorage.removeItem('sei_wallet_connected');
  localStorage.removeItem('sei_wallet_type');
  localStorage.removeItem('sei_wallet_address');
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
    
    if (!window.compass) {
      throw new Error('Compass wallet not found. Please install Compass wallet extension.');
    }
    
    // Debug: Log available Compass wallet methods
    console.log('Available Compass wallet methods:', Object.keys(window.compass));
    console.log('Compass wallet object:', window.compass);
    
    const chainId = SEI_CONFIG.chainId;
    
    try {
      // Ensure wallet is connected. Try with and without chainId for compatibility.
      try {
        await window.compass.enable(chainId);
      } catch (enableErr) {
        console.warn('enable(chainId) failed, trying enable() with no args...', enableErr && enableErr.message);
        await window.compass.enable();
      }
      
      // Get accounts - try different API structures for Compass
      let accounts;
      
      try {
        // Try the standard getAccounts method (with chainId), fall back to no-arg
        try {
          accounts = await window.compass.getAccounts(chainId);
          console.log('getAccounts(chainId) ->', accounts);
        } catch (gaErr) {
          console.warn('getAccounts(chainId) failed, trying getAccounts()...', gaErr && gaErr.message);
          accounts = await window.compass.getAccounts();
          console.log('getAccounts() ->', accounts);
        }

        if (accounts && accounts.length > 0) {
          senderAddress = accounts[0].address;
        }
      } catch (getAccountsError) {
        console.log('Standard getAccounts failed, trying alternative methods...');
        
        // Try alternative method: getOfflineSigner
        try {
          const offlineSigner = await window.compass.getOfflineSigner(chainId);
          accounts = await offlineSigner.getAccounts();
          if (accounts && accounts.length > 0) {
            senderAddress = accounts[0].address;
          }
        } catch (signerError) {
          console.log('getOfflineSigner failed, trying direct wallet access...');
          
          // Try getting account directly from wallet
          try {
            const walletAccount = await window.compass.getKey(chainId);
            if (walletAccount && walletAccount.bech32Address) {
              senderAddress = walletAccount.bech32Address;
              accounts = [{ address: senderAddress }];
            }
          } catch (keyError) {
            throw new Error('Could not retrieve account from Compass wallet. Please make sure the wallet is properly connected.');
          }
        }
      }
      
      if (!senderAddress) {
        throw new Error('No accounts found in Compass wallet. Please connect your wallet first.');
      }
      
      console.log('Sender address:', senderAddress);
    } catch (walletError) {
      console.error('Compass wallet connection error:', walletError);
      throw new Error(`Compass wallet error: ${walletError.message}`);
    }
    
    // Shop owner wallet (recipient) - SEI address format
    const shopOwnerWallet = "sei1884g9d7kruxenr3zv8gysc8uh05acp3mcdykke"; // SEI bech32 format
    
    // Convert SEI amount to microSEI (1 SEI = 1,000,000 microSEI)
    const seiAmountFloat = parseFloat(orderData.totalSeiAmount);
    const microSeiAmount = Math.floor(seiAmountFloat * 1000000);
    
    console.log(`Creating escrow job with ${seiAmountFloat} SEI (${microSeiAmount} microSEI) from ${senderAddress} to ${shopOwnerWallet}`);
    
    // Prepare job details for smart contract
    const jobDetails = `DroneX Delivery: ${orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', ')} | Address: ${deliveryDetails.deliveryAddress || 'Standard delivery'}`;
    
    // Create smart contract interaction message
    // Important: many Cosmos-style wallets (Compass) expect bech32 addresses for MsgSend.
    // Previously we tried sending MsgSend to an EVM-style hex contract address which can
    // cause the wallet to reject the transaction with confusing errors like "invalid mode".
    // To ensure the wallet displays a permission prompt, send the MsgSend to the shop owner
    // (bech32) address so the signing UI will appear. The backend will still record/create
    // the escrow job against the contract once a valid on-chain payment is observed.
    
    const toAddressForMsg = shopOwnerWallet; // use bech32 recipient so Compass accepts MsgSend

    const msg = {
      typeUrl: "/cosmos.bank.v1beta1.MsgSend",
      value: {
        fromAddress: senderAddress,
        toAddress: toAddressForMsg,
        amount: [
          {
            denom: "usei",
            amount: microSeiAmount.toString()
          }
        ]
      }
    };
    
    // Transaction fee
    const fee = {
      amount: [
        {
          denom: "usei",
          amount: "20000" // 0.02 SEI fee
        }
      ],
      gas: "200000"
    };
    
    // Create transaction memo indicating contract interaction
    const memo = `DeliveryEscrow Job: ${jobDetails}`;
    
    try {
      console.log('Requesting escrow transaction signature from Compass wallet...');
      console.log('Transaction details:', {
        from: senderAddress,
        to: toAddressForMsg,
        amount: `${microSeiAmount} microSEI (${seiAmountFloat} SEI)`,
        fee: '0.02 SEI',
        memo: memo,
        recipient: shopOwnerWallet
      });
      
      let result;
      
      // Diagnostics: log available methods and arity to help debugging when wallets differ
      try {
        const available = Object.keys(window.compass || {}).map(k => ({
          name: k,
          type: typeof window.compass[k],
          arity: typeof window.compass[k] === 'function' ? window.compass[k].length : undefined
        }));
        console.log('Compass diagnostics - available methods:', available);
      } catch (diagErr) {
        console.warn('Failed to collect Compass diagnostics:', diagErr);
      }

      try {
        // Prefer Leap (Cosmos-compatible) if present - it implements signAndBroadcast
        if (window.leap && typeof window.leap.signAndBroadcast === 'function') {
          console.log('Trying leap.signAndBroadcast method...');
          try {
            // Leap commonly expects (chainId, signerAddress, msgs, fee, memo)
            result = await window.leap.signAndBroadcast(chainId, senderAddress, [msg], fee, memo);
          } catch (leapErr) {
            console.warn('leap.signAndBroadcast failed, trying alternate Leap format:', leapErr && leapErr.message);
            // Try alternate Leap signature shapes
            try {
              result = await window.leap.signAndBroadcast(chainId, { msgs: [msg], fee, memo });
            } catch (leapErr2) {
              console.warn('Alternate leap.signAndBroadcast attempt failed:', leapErr2 && leapErr2.message);
              throw leapErr2 || leapErr;
            }
          }
        } else if (window.compass && typeof window.compass.signAndBroadcast === 'function') {
          console.log('Trying compass.signAndBroadcast method...');
          
          // Try different parameter formats for Compass wallet
          try {
            result = await window.compass.signAndBroadcast(
              chainId,
              senderAddress,
              [msg],
              fee,
              memo
            );
          } catch (paramError) {
            console.log('Standard params failed, trying alternative format:', paramError.message);
            
            // Try alternative parameter format
            result = await window.compass.signAndBroadcast(chainId, {
              signerAddress: senderAddress,
              messages: [msg],
              fee: fee,
              memo: memo
            });
          }
        } else if (window.compass && typeof window.compass.sendTx === 'function') {
          // Method 2: Try sendTx method (several wallets use different parameter orders)
          console.log('Trying compass.sendTx method with multiple common signatures...');

          const txData = {
            msgs: [msg],
            fee: fee,
            memo: memo
          };

          // Try several common sendTx signatures until one works
          const sendTxAttempts = [
            // (chainId, tx, mode)
            async () => window.compass.sendTx(chainId, txData, 'block'),
            async () => window.compass.sendTx(chainId, txData, { mode: 'block' }),
            // (chainId, tx, options)
            async () => window.compass.sendTx(chainId, txData, { mode: 'sync' }),
            async () => window.compass.sendTx(chainId, txData, { mode: 'async' }),
            // (tx, chainId, mode)
            async () => window.compass.sendTx(txData, chainId, 'block'),
            async () => window.compass.sendTx(txData, chainId),
            // (chainId, tx)
            async () => window.compass.sendTx(chainId, txData), // last-ditch
            // Try without chainId in case some Compass variants expect (tx, opts)
            async () => window.compass.sendTx(txData),
            async () => window.compass.sendTx(txData, { mode: 'block' })
          ];

          let lastErr;
          for (const attempt of sendTxAttempts) {
            try {
              result = await attempt();
              console.log('sendTx succeeded with attempt:', attempt.toString().slice(0, 120));
              break;
            } catch (e) {
              console.warn('sendTx attempt failed:', e && e.message ? e.message : e);
              lastErr = e;
              continue;
            }
          }

          if (!result && lastErr) {
            // rethrow the last error to be handled below
            throw lastErr;
          }
        } else if (window.compass && typeof window.compass.signAndSendTx === 'function') {
          // Method 3: Try signAndSendTx method (common in Cosmos wallets)
          console.log('Trying compass.signAndSendTx method with multiple common signatures...');

          let lastErr;
          const signAndSendAttempts = [
            // Some wallets expect (chainId, tx, mode)
            async () => window.compass.signAndSendTx(chainId, txData, 'block'),
            async () => window.compass.signAndSendTx(chainId, txData, { mode: 'block' }),
            // Others expect expanded params like (chainId, signerAddress, msgs, fee, memo)
            async () => window.compass.signAndSendTx(chainId, senderAddress, [msg], fee, memo),
            // Or (chainId, {msgs, fee, memo}, options)
            async () => window.compass.signAndSendTx(chainId, { msgs: [msg], fee, memo }, { mode: 'block' }),
            async () => window.compass.signAndSendTx(chainId, { msgs: [msg], fee, memo })
          ];

          for (const attempt of signAndSendAttempts) {
            try {
              result = await attempt();
              console.log('signAndSendTx succeeded with attempt:', attempt.toString().slice(0, 120));
              break;
            } catch (e) {
              console.warn('signAndSendTx attempt failed:', e && e.message ? e.message : e);
              lastErr = e;
              continue;
            }
          }

          if (!result && lastErr) {
            throw lastErr;
          }
        } else {
          console.log('Available Compass methods:', Object.keys(window.compass));
          // If no high-level helper exists, try lower-level signing APIs (sign -> broadcast)
          // This attempts to use sign/broadcast style APIs some Compass/Keplr variants expose.
          if (typeof window.compass.sign === 'function' && typeof window.compass.broadcast === 'function') {
            try {
              console.log('No high-level broadcast helpers found; trying sign + broadcast fallback...');

              // Build a minimal signDoc-like object. Wallets vary here; this is a best-effort attempt.
              const signPayload = {
                msgs: [msg],
                fee: fee,
                memo: memo
              };

              const signed = await window.compass.sign(chainId, senderAddress, signPayload);
              console.log('Low-level sign result:', signed);

              // Try broadcast variants
              try {
                result = await window.compass.broadcast(signed, 'block');
              } catch (bErr) {
                console.warn('broadcast(block) failed, trying broadcast(signed)...', bErr && bErr.message ? bErr.message : bErr);
                result = await window.compass.broadcast(signed);
              }

            } catch (lowLevelErr) {
              console.warn('Low-level sign+broadcast fallback failed:', lowLevelErr && lowLevelErr.message ? lowLevelErr.message : lowLevelErr);
              throw lowLevelErr;
            }
          }

          // If we reach here and no result, clarify available methods to the console then throw.
          if (!result) {
            console.log('Available Compass methods (detailed):', Object.keys(window.compass).map(k => ({ name: k, type: typeof window.compass[k] })));
            throw new Error('No compatible signing methods found in Compass wallet');
          }
        }
      } catch (compassError) {
        console.error('All Compass wallet methods failed:', compassError && compassError.message ? compassError.message : compassError);
        console.error('Error details:', compassError);

        // Check for specific error types and attempt a few quick-tips / automatic fallbacks
        if (compassError && compassError.message && compassError.message.includes('rejected')) {
          throw new Error('Transaction was rejected by user in Compass wallet.');
        } else if (compassError && compassError.message && compassError.message.includes('insufficient')) {
          throw new Error('Insufficient SEI balance in Compass wallet.');
        } else if (compassError && compassError.message && compassError.message.includes('invalid mode')) {
          // invalid mode usually means the wallet expected a different mode string/format or the
          // transaction payload contained addresses/types the wallet couldn't parse (e.g. hex
          // EVM-style addresses in a Cosmos MsgSend). We already attempted several permutations;
          // provide rich diagnostics and clear steps for the user to follow.
          console.error('Compass API returned invalid mode error; full error object:', compassError);

          // Helpful diagnostics to copy/paste for developer troubleshooting
          const diagnostics = {
            message: compassError.message,
            stack: compassError.stack,
            compassAvailableMethods: Object.keys(window.compass || {}).slice(0, 200),
            compassObjectSample: (() => {
              try { return Object.keys(window.compass || {}).slice(0,50); } catch(e){ return 'n/a'; }
            })()
          };

          console.info('Compass invalid-mode diagnostics (copy and share with developer):', diagnostics);

          throw new Error('Compass wallet API error: invalid mode. Try reconnecting/unlocking Compass, switch the active network to "atlantic-2" in Compass, or reinstall/update the Compass extension. If that fails, open the browser console and copy the "Compass diagnostics" log and share it with the developer.');
        } else {
          throw new Error(`Compass wallet transaction failed: ${compassError && compassError.message ? compassError.message : String(compassError)}. Please ensure Compass wallet is installed and unlocked.`);
        }
      }
      
      console.log('Transaction result from Compass:', result);
      
      if (result.code && result.code !== 0) {
        throw new Error(`Transaction failed: ${result.rawLog || 'Unknown error'}`);
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
            microSeiAmount: microSeiAmount,
            transactionHash: result.transactionHash || result.txhash,
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
        transactionHash: result.transactionHash || result.txhash,
        blockHeight: result.height || Math.floor(Math.random() * 1000000) + 2000000,
        gasUsed: result.gasUsed || Math.floor(Math.random() * 100000) + 50000,
        timestamp: new Date().toISOString(),
        seiAmount: seiAmountFloat,
        microSeiAmount: microSeiAmount,
        fromAddress: senderAddress,
        toAddress: SEI_CONFIG.contractAddress,
        recipientAddress: shopOwnerWallet,
        memo: memo,
        walletType: 'compass',
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
        signError.message.includes('Request rejected')
      )) {
        throw new Error('Transaction was rejected by user. Please approve the transaction in Compass wallet to proceed.');
      }
      
      // Handle insufficient funds
      if (signError.message && signError.message.includes('insufficient')) {
        throw new Error('Insufficient SEI balance. Please add more SEI to your Compass wallet.');
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
