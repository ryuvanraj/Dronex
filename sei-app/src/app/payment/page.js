
"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { useCart } from "@/contexts/CartContext";
import { 
  prepareOrderForSei, 
  submitDroneDeliveryOrder, 
  connectSeiWallet, 
  executeSeiPayment,
  getSeiExchangeRate,
  isWalletConnected,
  disconnectWallet
} from "@/app/services/seiIntegration";
import { convertUsdcToSei } from "@/app/data/product";
import ElizaOSDroneDisplay from "@/components/ElizaOSDroneDisplay";

const DEFAULT_CHAIN_ID = process.env.NEXT_PUBLIC_SEI_CHAIN_ID || "atlantic-2";

function truncateMiddle(value, prefix = 8, suffix = 6) {
  if (!value) return "";
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}...${value.slice(-suffix)}`;
}

export default function PaymentPage() {
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [deliveryRequest, setDeliveryRequest] = useState(null);
  const [seiExchangeRate, setSeiExchangeRate] = useState(3.12);
  const [paymentStep, setPaymentStep] = useState('wallet'); // 'wallet' | 'processing' | 'success'
  const [successDetails, setSuccessDetails] = useState(null);
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [droneAssignmentData, setDroneAssignmentData] = useState(null);
  const [sessionId] = useState(() => `cart-${Date.now()}`); // Generate once on mount
  
  const { cart, getTotalPrice, clearCart } = useCart();
  const chainId = DEFAULT_CHAIN_ID;

  // Check for delivery request and get exchange rate on mount
  useEffect(() => {
    const initializePaymentPage = async () => {
      // Check if wallet is already connected
      const existingConnection = isWalletConnected();
      console.log('Checking existing wallet connection:', existingConnection);
      
      if (existingConnection && typeof existingConnection === 'object' && existingConnection.isConnected) {
        setWalletConnected(true);
        setWalletAddress(existingConnection.address);
        console.log('Wallet already connected:', existingConnection.address);
      } else {
        console.log('No existing wallet connection found');
        setWalletConnected(false);
        setWalletAddress('');
      }
      
      // Check for delivery request
      const request = localStorage.getItem("currentDeliveryRequest");
      if (request) {
        setDeliveryRequest(JSON.parse(request));
        const parsedRequest = JSON.parse(request);
        if (parsedRequest.receiverLocation) {
          setDeliveryAddress(parsedRequest.receiverLocation);
        }
      }
      
      // Get current SEI exchange rate
      try {
        const rateData = await getSeiExchangeRate();
        setSeiExchangeRate(rateData.usdcToSei);
      } catch (error) {
        console.error('Failed to fetch exchange rate:', error);
      }
    };
    
    initializePaymentPage();
  }, []);

  // Calculate order totals - either from cart or delivery request
  const isDeliveryOrder = !!deliveryRequest;
  const subtotal = isDeliveryOrder 
    ? parseFloat(deliveryRequest.escrowAmount) 
    : getTotalPrice();
  const deliveryFee = subtotal / 10;
  const total = subtotal + deliveryFee;
  const totalItems = isDeliveryOrder 
    ? 1 
    : cart.reduce((sum, item) => sum + item.quantity, 0);

  // SEI conversion amounts
  const subtotalSei = convertUsdcToSei(subtotal);
  const deliveryFeeSei = convertUsdcToSei(deliveryFee);
  const totalSei = convertUsdcToSei(total);

  // Check for existing wallet connection on mount
  useEffect(() => {
    const checkWallet = async () => {
      if (typeof window === "undefined") return;
      
      try {
        // Try Sei wallet first
        if (window.sei) {
          const accounts = await window.sei.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            setWalletConnected(true);
            setWalletAddress(accounts[0]);
            return;
          }
        }
        
        // Try MetaMask as fallback
        if (window.ethereum) {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setWalletConnected(true);
            setWalletAddress(accounts[0]);
          }
        }
      } catch (error) {
        console.log('No wallet connected yet');
      }
    };
    checkWallet();
  }, [chainId]);

  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      console.log('Attempting to connect Sei wallet...');
      const walletInfo = await connectSeiWallet();
      setWalletConnected(walletInfo.isConnected);
      setWalletAddress(walletInfo.address);
      console.log('Wallet connected successfully:', walletInfo);
    } catch (err) {
      console.error("Error connecting Sei wallet:", err);
      alert(`Failed to connect to Sei wallet: ${err.message}\n\nPlease make sure:\n1. MetaMask or Sei wallet extension is installed\n2. You have created a Sei wallet\n3. You approve the connection request`);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWalletHandler = () => {
    disconnectWallet();
    setWalletConnected(false);
    setWalletAddress('');
    console.log('Wallet disconnected');
  };

  const handlePayment = async () => {
    if (!walletConnected) {
      // Connect to Sei wallet first
      await connectWallet();
      return;
    }

    if (!deliveryAddress.trim()) {
      alert('Please enter a delivery address');
      return;
    }

    setIsProcessing(true);
    setPaymentStep('processing');
    
    try {
      // Step 1: Prepare order data for Sei blockchain
      const orderData = isDeliveryOrder 
        ? {
            items: [{ 
              id: 'delivery', 
              name: 'One-to-One Delivery Service', 
              quantity: 1, 
              usdcPrice: parseFloat(deliveryRequest.escrowAmount),
              seiPrice: convertUsdcToSei(parseFloat(deliveryRequest.escrowAmount)),
              totalSeiAmount: convertUsdcToSei(parseFloat(deliveryRequest.escrowAmount))
            }],
            totalUsdcAmount: parseFloat(deliveryRequest.escrowAmount),
            totalSeiAmount: convertUsdcToSei(parseFloat(deliveryRequest.escrowAmount))
          }
        : prepareOrderForSei(cart);

      // Add delivery fee to the total
      const totalOrderAmount = parseFloat(orderData.totalSeiAmount) + parseFloat(convertUsdcToSei(deliveryFee));

      console.log('Processing payment:', {
        usdcTotal: total,
        seiTotal: totalOrderAmount,
        deliveryAddress,
        walletAddress
      });

      // Step 2: Execute Sei blockchain payment via DeliveryEscrow smart contract
      const escrowDeliveryDetails = {
        deliveryAddress: deliveryAddress,
        pickupAddress: isDeliveryOrder ? deliveryRequest.senderLocation : "Sei Delivery Hub",
        walletAddress: walletAddress,
        customerWallet: walletAddress, // User's wallet
        shopOwnerWallet: "sei1884g9d7kruxenr3zv8gysc8uh05acp3mcdykke", // Shop owner wallet
        instructions: `Delivery for order - ${orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}`
      };
      
      const paymentResult = await executeSeiPayment({
        ...orderData,
        totalSeiAmount: totalOrderAmount.toString()
      }, walletAddress, escrowDeliveryDetails);

      if (!paymentResult.success) {
        throw new Error('Blockchain payment failed');
      }

      // Step 3: Submit order to Sei-SO backend for drone processing
      const backendDeliveryDetails = {
        deliveryAddress: deliveryAddress,
        pickupAddress: isDeliveryOrder ? deliveryRequest.senderLocation : "Sei Delivery Hub",
        walletAddress: walletAddress,
        customerWallet: walletAddress, // User's wallet
        shopOwnerWallet: "0xA50050DBDBe672a5F0261e403909bCB8590B9130", // Shop owner wallet
        instructions: `Delivery for order - ${orderData.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}`
      };

      let droneJobResult = null;
      let elizaOSData = null;
      let hiveIntelligence = null;
      
      try {
        droneJobResult = await submitDroneDeliveryOrder({
          ...orderData,
          totalSeiAmount: totalOrderAmount.toString()
        }, backendDeliveryDetails);
        
        console.log('Drone delivery job created:', droneJobResult);
        
        // Fetch ElizaOS and Hive Intelligence data
        try {
          const elizaResponse = await fetch('http://localhost:3001/api/drone/eliza-status');
          if (elizaResponse.ok) {
            elizaOSData = await elizaResponse.json();
          }
          
          const hiveResponse = await fetch('http://localhost:3001/api/drone/hive-intelligence');
          if (hiveResponse.ok) {
            hiveIntelligence = await hiveResponse.json();
          }
        } catch (fetchError) {
          console.log('Could not fetch ElizaOS/Hive data:', fetchError);
        }
        
      } catch (backendError) {
        console.error('Backend submission failed, but payment succeeded:', backendError);
        // Continue with order processing even if backend fails
      }

      // Step 4: Create order record
      const orderId = isDeliveryOrder 
        ? `DEL-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
        : `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
      
      const newOrder = {
        id: orderId,
        date: new Date().toISOString(),
        status: "payment-confirmed",
        total: subtotal,
        deliveryFee: deliveryFee,
        finalTotal: total,
        deliveryAddress: deliveryAddress,
        walletAddress: walletAddress,
        estimatedDelivery: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        type: isDeliveryOrder ? "delivery" : "product",
        
        // Sei blockchain details
        seiTransaction: {
          hash: paymentResult.transactionHash,
          blockHeight: paymentResult.blockHeight,
          gasUsed: paymentResult.gasUsed,
          timestamp: paymentResult.timestamp
        },
        
        // Pricing details
        pricing: {
          usdcTotal: total,
          seiTotal: totalOrderAmount,
          exchangeRate: seiExchangeRate
        },
        
        // Drone job details (if backend succeeded)
        droneJobId: droneJobResult?.jobId || null,
        droneStatus: droneJobResult?.status || 'processing',
        
        // ElizaOS and Hive Intelligence data
        elizaOS: elizaOSData || null,
        hiveIntelligence: hiveIntelligence || null,
        
        // Backend response details
        backendResponse: droneJobResult?.backendResponse || null
      };

      if (isDeliveryOrder) {
        newOrder.items = [{
          name: "One-to-One Delivery Service", 
          quantity: 1, 
          price: parseFloat(deliveryRequest.escrowAmount)
        }];
        newOrder.pickupLocation = deliveryRequest.senderLocation;
        newOrder.receiverLocation = deliveryRequest.receiverLocation;
        localStorage.removeItem("currentDeliveryRequest");
      } else {
        newOrder.items = cart.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          seiPrice: convertUsdcToSei(item.price)
        }));
      }

      // Save to order history
      const existingOrders = JSON.parse(localStorage.getItem('completedOrders') || '[]');
      existingOrders.unshift(newOrder);
      localStorage.setItem('completedOrders', JSON.stringify(existingOrders));
      
      // Step 5: Complete the process
      setPaymentStep('success');
      
      // Store success details for the success screen
      setSuccessDetails({
        transactionHash: paymentResult.transactionHash,
        amount: totalOrderAmount,
        usdAmount: total,
        deliveryTime: droneJobResult?.estimatedDeliveryTime || new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now if not provided
        droneJobResult: droneJobResult ? {
          ...droneJobResult,
          droneId: droneJobResult.droneId || `DRN-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
        } : null,
        elizaOSData,
        hiveIntelligence,
        isDeliveryOrder
      });
      
      // Clear cart if it's not a delivery order
      if (!isDeliveryOrder) {
        clearCart();
      }
      
      // Don't redirect immediately, let user see success screen
      // setTimeout(() => {
      //   window.location.href = '/order-history';
      // }, 5000);
      
    } catch (error) {
      setIsProcessing(false);
      setPaymentStep('wallet');
      console.error('Payment failed:', error);
      
      let errorMessage = 'Payment failed. Please try again.';
      if (error.message.includes('wallet')) {
        errorMessage = 'Wallet connection failed. Please reconnect your wallet and try again.';
      } else if (error.message.includes('insufficient')) {
        errorMessage = 'Insufficient SEI balance. Please add more SEI to your wallet.';
      }
      
      alert(errorMessage);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-drone-charcoal bg-drone-graphite/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <Link 
              href={isDeliveryOrder ? "/dashboard" : "/cart"} 
              className="flex items-center gap-2 text-drone-highlight hover:text-white transition-colors"
            >
              <span className="text-lg">←</span>
              <span className="font-orbitron">
                {isDeliveryOrder ? "Back to Dashboard" : "Back to Cart"}
              </span>
            </Link>
            <h1 className="font-orbitron text-2xl font-bold text-drone-highlight">
              {isDeliveryOrder ? "Delivery Payment" : "Secure Payment"}
            </h1>
          </div>
        </div>
      </header>

      {/* Payment Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        {paymentStep === 'success' && successDetails ? (
          // Success Screen
          <div className="max-w-4xl mx-auto">
            <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-8">
              {/* Success Header */}
              <div className="text-center mb-8">
                <div className="w-20 h-20 bg-green-600/20 border border-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-4xl">✅</span>
                </div>
                <h1 className="text-3xl font-bold text-green-400 font-orbitron mb-2">
                  Payment Successful!
                </h1>
                <p className="text-gray-300">
                  {successDetails.isDeliveryOrder 
                    ? "Your drone courier is being dispatched!" 
                    : "Your drone delivery is on the way!"
                  }
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Transaction Details */}
                <div className="bg-drone-charcoal/50 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-drone-highlight mb-4 font-orbitron">
                    Transaction Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Transaction Hash:</span>
                      <span className="text-white font-mono break-all ml-2">
                        {truncateMiddle(successDetails.transactionHash, 12, 8)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Amount Paid:</span>
                      <div className="text-right">
                        <div className="text-white font-bold">{successDetails.amount} SEI</div>
                        <div className="text-gray-400">≈ ${successDetails.usdAmount} USD</div>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Network:</span>
                      <span className="text-white">Sei EVM Testnet</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wallet Type:</span>
                      <span className="text-white">
                        {window?.sei ? 'Sei Wallet' : 'MetaMask'}
                      </span>
                    </div>
                  </div>
                  
                  {/* View Transaction Button */}
                  <div className="mt-6 pt-4 border-t border-drone-charcoal">
                    <button 
                      onClick={() => window.open(`https://seistream.app/tx/${successDetails.transactionHash}`, '_blank')}
                      className="w-full bg-drone-highlight hover:bg-drone-highlight/80 text-black font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      View on Block Explorer
                    </button>
                  </div>
                </div>

                {/* Drone & Delivery Info */}
                <div className="bg-drone-charcoal/50 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-drone-highlight mb-4 font-orbitron">
                    Delivery Information
                  </h3>
                  
                 

                  {/* Drone Details */}
                  {successDetails.droneJobResult && (
                    <div className="mb-6">
                      <h4 className="font-bold text-white mb-2">Assigned Drone</h4>
                      <div className="bg-drone-graphite/50 rounded p-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Drone ID:</span>
                          <span className="text-white font-mono">
                            {successDetails.droneJobResult.droneId}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Job ID:</span>
                          <span className="text-white font-mono">{successDetails.droneJobResult.jobId}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Status:</span>
                          <span className="text-green-400">Dispatching</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ElizaOS Info */}
                  {successDetails.elizaOSData && (
                    <div className="mb-4">
                      <h4 className="font-bold text-white mb-2">🤖 ElizaOS Agent</h4>
                      <div className="bg-drone-graphite/50 rounded p-3 text-sm">
                        <div className="text-green-400">
                          Agent: {successDetails.elizaOSData.agent || 'Active'}
                        </div>
                        <div className="text-gray-300">
                          Status: {successDetails.elizaOSData.droneStatus || 'Ready for Dispatch'}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Hive Intelligence */}
                  {successDetails.hiveIntelligence && (
                    <div>
                      <h4 className="font-bold text-white mb-2">🧠 Hive Intelligence</h4>
                      <div className="bg-drone-graphite/50 rounded p-3 text-sm">
                        <div className="text-blue-400">
                          Network: {successDetails.hiveIntelligence.networkStatus || 'Connected'}
                        </div>
                        <div className="text-gray-300">
                          Route: {successDetails.hiveIntelligence.routeOptimization || 'Optimized'}
                        </div>
                        {successDetails.hiveIntelligence.droneWallet && (
                          <div className="text-gray-300">
                            Drone Wallet: {truncateMiddle(successDetails.hiveIntelligence.droneWallet)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 pt-6 border-t border-drone-charcoal">
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button 
                    onClick={() => window.location.href = '/order-history'}
                    className="bg-drone-highlight hover:bg-drone-highlight/80 text-black font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    View Order History
                  </button>
                  <button 
                    onClick={() => window.location.href = '/'}
                    className="border border-drone-highlight text-drone-highlight hover:bg-drone-highlight hover:text-black font-bold py-3 px-6 rounded-lg transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          // Original Payment Form
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Payment Form */}
          <div className="lg:col-span-2 space-y-8">
            {/* Delivery Address */}
            <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
              <h2 className="text-xl font-bold text-drone-highlight mb-6 font-orbitron">Delivery Address</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 mb-2">Delivery Location</label>
                  <input
                    type="text"
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder="Enter your address for drone delivery"
                    className="w-full px-4 py-3 bg-drone-charcoal border border-drone-highlight/30 rounded-lg text-white placeholder-gray-400 focus:border-drone-highlight focus:outline-none"
                    suppressHydrationWarning={true}
                  />
                  <p className="text-sm text-gray-400 mt-2">📍 Drone delivery available within 10km radius</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-300 mb-2">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 123-4567"
                      className="w-full px-4 py-3 bg-drone-charcoal border border-drone-highlight/30 rounded-lg text-white placeholder-gray-400 focus:border-drone-highlight focus:outline-none"
                      suppressHydrationWarning={true}
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 mb-2">Special Instructions</label>
                    <input
                      type="text"
                      placeholder="e.g., Leave at front door"
                      className="w-full px-4 py-3 bg-drone-charcoal border border-drone-highlight/30 rounded-lg text-white placeholder-gray-400 focus:border-drone-highlight focus:outline-none"
                      suppressHydrationWarning={true}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
              <h2 className="text-xl font-bold text-drone-highlight mb-6 font-orbitron">Payment Method</h2>
              
              {/* MetaMask Sei Blockchain Payment */}
              <div className="p-6 border-2 border-drone-highlight rounded-lg bg-drone-charcoal/30">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-drone-highlight rounded-full flex items-center justify-center">
                    <span className="text-2xl">⛓️</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-xl">MetaMask Sei Wallet</h3>
                    <p className="text-sm text-gray-400">Secure payment via Sei Blockchain with escrow protection</p>
                  </div>
                  <span className="text-xs bg-drone-highlight text-black px-3 py-1 rounded-full font-bold">ONLY OPTION</span>
                </div>

                {/* Wallet Connection Status */}
                <div className="mb-6">
                  {walletConnected ? (
                    <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-600 rounded-lg">
                      <span className="text-green-400 text-xl">✅</span>
                      <div>
                        <h4 className="font-bold text-green-400">Wallet Connected</h4>
                        <p className="text-sm text-gray-300">{truncateMiddle(walletAddress)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 p-4 bg-yellow-900/30 border border-yellow-600 rounded-lg">
                      <span className="text-yellow-400 text-xl">⚠️</span>
                      <div>
                        <h4 className="font-bold text-yellow-400">Wallet Not Connected</h4>
                        <p className="text-sm text-gray-300">Click &quot;Connect Wallet&quot; to proceed with payment</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Blockchain Features */}
                <div className="p-4 bg-drone-charcoal/50 rounded-lg">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">🔒</span>
                    <div>
                      <h4 className="font-bold text-drone-highlight">Sei Blockchain Escrow Protection</h4>
                      <p className="text-sm text-gray-400">Your payment is secured until delivery is confirmed</p>
                    </div>
                  </div>
                  <ul className="space-y-2 text-sm text-gray-300">
                    <li>✅ Funds held in smart contract until delivery</li>
                    <li>✅ Automatic release upon successful delivery</li>
                    <li>✅ Dispute resolution through decentralized protocol</li>
                    <li>✅ Full transparency and immutable transaction records</li>
                    <li>✅ Fast and low-cost transactions on Sei Network</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6 sticky top-6">
              <h3 className="text-xl font-bold text-drone-highlight mb-6 font-orbitron">
                {isDeliveryOrder ? "Delivery Summary" : "Order Summary"}
              </h3>
              
              {isDeliveryOrder ? (
                /* Delivery Request Summary */
                <div className="space-y-4 mb-6">
                  <div className="bg-drone-charcoal/50 p-4 rounded-lg">
                    <h4 className="font-bold text-white mb-2">{deliveryRequest.itemName}</h4>
                    <div className="space-y-1 text-sm text-gray-300">
                      <div className="flex justify-between">
                        <span>Service:</span>
                        <span className="text-drone-highlight capitalize">{deliveryRequest.serviceType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Receiver:</span>
                        <span className="text-white">{deliveryRequest.receiverName}</span>
                      </div>
                      {deliveryRequest.weight && (
                        <div className="flex justify-between">
                          <span>Weight:</span>
                          <span className="text-white">{deliveryRequest.weight}kg</span>
                        </div>
                      )}
                      {deliveryRequest.description && (
                        <div className="mt-2">
                          <span className="text-gray-400">Description:</span>
                          <p className="text-white text-xs mt-1">{deliveryRequest.description}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between text-gray-300">
                      <span>Escrow Amount</span>
                      <div className="text-right">
                        <span>${subtotal.toFixed(2)}</span>
                        <div className="text-xs text-drone-highlight">≈ {subtotalSei} SEI</div>
                      </div>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>Courier Service</span>
                      <div className="text-right">
                        <span>${deliveryFee.toFixed(2)}</span>
                        <div className="text-xs text-drone-highlight">≈ {deliveryFeeSei} SEI</div>
                      </div>
                    </div>
                    <hr className="border-drone-charcoal" />
                    <div className="flex justify-between text-white font-bold text-lg">
                      <span>Total</span>
                      <div className="text-right">
                        <span className="text-drone-highlight">${total.toFixed(2)}</span>
                        <div className="text-sm text-drone-highlight font-normal">≈ {totalSei} SEI</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Product Order Summary */
                <div className="space-y-3 mb-6">
                  <div className="flex justify-between text-gray-300">
                    <span>Items ({totalItems})</span>
                    <div className="text-right">
                      <span>${subtotal.toFixed(2)}</span>
                      <div className="text-xs text-drone-highlight">≈ {subtotalSei} SEI</div>
                    </div>
                  </div>
                  <div className="flex justify-between text-gray-300">
                    <span>Drone Delivery</span>
                    <div className="text-right">
                      <span>${deliveryFee.toFixed(2)}</span>
                      <div className="text-xs text-drone-highlight">≈ {deliveryFeeSei} SEI</div>
                    </div>
                  </div>
                  <hr className="border-drone-charcoal" />
                  <div className="flex justify-between text-white font-bold text-lg">
                    <span>Total</span>
                    <div className="text-right">
                      <span className="text-drone-highlight">${total.toFixed(2)}</span>
                      <div className="text-sm text-drone-highlight font-normal">≈ {totalSei} SEI</div>
                    </div>
                  </div>
                  
                  {/* Exchange Rate Info */}
                  <div className="mt-4 p-3 bg-drone-charcoal/50 rounded-lg">
                    <div className="text-xs text-gray-400 text-center">
                      Exchange Rate: 1 USD = {seiExchangeRate} SEI
                    </div>
                  </div>
                </div>
              )}

              <button 
                onClick={handlePayment}
                disabled={isProcessing || isConnecting || !deliveryAddress || (isDeliveryOrder ? !deliveryRequest : cart.length === 0)}
                className="w-full bg-drone-highlight hover:bg-drone-highlight/80 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold py-4 px-6 rounded-lg transition-colors font-orbitron cursor-pointer"
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⚡</span>
                    Processing Payment...
                  </span>
                ) : isConnecting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">⚡</span>
                    Connecting Wallet...
                  </span>
                ) : walletConnected ? (
                  isDeliveryOrder ? 'Pay for Delivery via Sei Blockchain' : 'Complete Order via Sei Blockchain'
                ) : (
                  'Connect MetaMask Sei Wallet'
                )}
              </button>

              {/* ElizaOS and Hive Intelligence Display - Show when processing or connected */}
              {(isProcessing || walletConnected) && (
                <div className="mt-6">
                  <ElizaOSDroneDisplay 
                    orderId={isDeliveryOrder ? deliveryRequest?.id : sessionId}
                    onDataUpdate={(data) => {
                      console.log('ElizaOS/Hive data updated:', data);
                      if (data.selectedDrone) {
                        setSelectedDrone(data.selectedDrone);
                      }
                      if (data.assignmentData) {
                        setDroneAssignmentData(data.assignmentData);
                      }
                    }}
                    selectedDrone={selectedDrone}
                    assignmentData={droneAssignmentData}
                  />
                </div>
              )}

              {/* Wallet Addresses Information */}
              {walletConnected && (
                <div className="mt-6">
                  <div className="hud-card p-6">
                    <h4 className="font-orbitron text-lg text-drone-highlight mb-4">💳 Transaction Parties</h4>
                    <div className="space-y-4">
                      {/* Customer Wallet */}
                      <div className="flex items-center justify-between p-3 bg-drone-charcoal/20 rounded-lg">
                        <div>
                          <div className="text-sm text-gray-400">👤 Customer Wallet</div>
                          <div className="text-sm text-gray-300 font-mono mt-1">
                            {walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : 'Not connected'}
                          </div>
                        </div>
                        {walletAddress && (
                          <button 
                            onClick={() => navigator.clipboard.writeText(walletAddress)}
                            className="px-3 py-1 bg-drone-highlight/20 text-drone-highlight text-xs rounded hover:bg-drone-highlight/30 transition-colors"
                          >
                            Copy
                          </button>
                        )}
                      </div>

                      {/* Shop Owner Wallet */}
                      <div className="flex items-center justify-between p-3 bg-drone-charcoal/20 rounded-lg">
                        <div>
                          <div className="text-sm text-gray-400">🏪 Shop Owner Wallet</div>
                          <div className="text-sm text-gray-300 font-mono mt-1">
                            0xA500...9130
                          </div>
                        </div>
                        <button 
                          onClick={() => navigator.clipboard.writeText('0xA50050DBDBe672a5F0261e403909bCB8590B9130')}
                          className="px-3 py-1 bg-drone-highlight/20 text-drone-highlight text-xs rounded hover:bg-drone-highlight/30 transition-colors"
                        >
                          Copy
                        </button>
                      </div>

                      {/* Drone Wallet (if assigned) */}
                      {selectedDrone?.walletAddress && (
                        <div className="flex items-center justify-between p-3 bg-drone-charcoal/20 rounded-lg">
                          <div>
                            <div className="text-sm text-gray-400">🚁 Assigned Drone Wallet</div>
                            <div className="text-sm text-gray-300 font-mono mt-1">
                              {`${selectedDrone.walletAddress.slice(0, 8)}...${selectedDrone.walletAddress.slice(-6)}`}
                            </div>
                          </div>
                          <button 
                            onClick={() => navigator.clipboard.writeText(selectedDrone.walletAddress)}
                            className="px-3 py-1 bg-drone-highlight/20 text-drone-highlight text-xs rounded hover:bg-drone-highlight/30 transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      )}

                      {/* Platform Escrow Wallet */}
                      <div className="flex items-center justify-between p-3 bg-drone-charcoal/20 rounded-lg">
                        <div>
                          <div className="text-sm text-gray-400">🔒 Escrow Contract</div>
                          <div className="text-sm text-gray-300 font-mono mt-1">
                            sei188...ykke
                          </div>
                        </div>
                        <button 
                          onClick={() => navigator.clipboard.writeText('sei1884g9d7kruxenr3zv8gysc8uh05acp3mcdykke')}
                          className="px-3 py-1 bg-drone-highlight/20 text-drone-highlight text-xs rounded hover:bg-drone-highlight/30 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-4 p-3 bg-blue-400/10 border border-blue-400/20 rounded-lg">
                      <div className="text-xs text-blue-400 font-semibold mb-1">ℹ️ Transaction Flow</div>
                      <div className="text-xs text-gray-300">
                        Payment flows from Customer → Escrow → Shop Owner. Drone receives delivery fee upon completion.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Security Features */}
              <div className="mt-6 pt-6 border-t border-drone-charcoal">
                <h4 className="font-bold text-white mb-3">Security Features</h4>
                <ul className="space-y-1 text-sm text-gray-300">
                  <li>🔐 End-to-end encryption</li>
                  <li>🛡️ Fraud protection</li>
                  <li>⛓️ Blockchain verification</li>
                  <li>📱 Real-time tracking</li>
                </ul>
              </div>

                {isDeliveryOrder && (
                  <p className="text-xs text-gray-400 mt-1">
                    One-to-one courier delivery via drone
                  </p>
                )}
              </div>
            </div>
          </div>
       
        )} {/* Close the conditional for original payment form */}
      </div>

      {/* Footer */}
      <footer className="border-t border-drone-charcoal bg-drone-graphite/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="text-center">
            <p className="font-orbitron text-drone-highlight">DroneX • Powered by Sei Blockchain • Eliza OS Integration</p>
            <p className="text-sm text-gray-400 mt-2">Revolutionizing delivery with decentralized drone networks</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
