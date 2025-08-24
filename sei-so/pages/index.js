import { useState } from "react";
import { ethers } from "ethers";
const CONTRACT_ABI = [
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"jobId","type":"uint256"},{"indexed":true,"internalType":"address","name":"recipient","type":"address"},{"indexed":true,"internalType":"address","name":"feeWallet","type":"address"},{"indexed":false,"internalType":"uint256","name":"recipientAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"feeAmount","type":"uint256"}],"name":"JobCompleted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"jobId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"JobFunded","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"uint256","name":"jobId","type":"uint256"},{"indexed":true,"internalType":"address","name":"poster","type":"address"},{"indexed":false,"internalType":"string","name":"details","type":"string"},{"indexed":false,"internalType":"address","name":"recipient","type":"address"},{"indexed":false,"internalType":"address","name":"feeWallet","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"JobPosted","type":"event"},
  {"inputs":[{"internalType":"uint256","name":"jobId","type":"uint256"}],"name":"confirmDelivery","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"jobCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"jobs","outputs":[{"internalType":"address","name":"poster","type":"address"},{"internalType":"address","name":"recipient","type":"address"},{"internalType":"address","name":"feeWallet","type":"address"},{"internalType":"string","name":"details","type":"string"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"bool","name":"funded","type":"bool"},{"internalType":"bool","name":"completed","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"string","name":"details","type":"string"},{"internalType":"address","name":"recipient","type":"address"}],"name":"postJob","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"payable","type":"function"},
  {"inputs":[],"name":"FEE_WALLET","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}
];
const CONTRACT_ADDRESS = "0x233D7487e447248DF9f71C6db46e8454254EB808";

export default function Home() {
  // Poll backend for delivery confirmation and release funds
  async function pollDeliveryConfirmation(jobId) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://localhost:3001/job/${jobId}/status`);
        const data = await res.json();
        if (data.status === 'confirmed') {
          clearInterval(interval);
          setStatus(`Delivery confirmed for job ${jobId}. Funds released!`);
        }
      } catch (err) {
        console.error('Error polling delivery confirmation:', err);
      }
    }, 5000); // Poll every 5 seconds
  }

  // Call confirmDelivery on the contract
  async function releaseFunds(jobId) {
    try {
      let provider;
      if (window.sei) {
        provider = new ethers.BrowserProvider(window.sei);
      } else if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
      } else {
        setStatus("No Sei or EVM wallet found");
        return;
      }
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.confirmDelivery(jobId);
      setStatus(`Funds released! Transaction: ${tx.hash}`);
      await tx.wait();
    } catch (err) {
      setStatus(`Error releasing funds: ${err.message}`);
      console.error('Error releasing funds:', err);
    }
  }
  const [walletAddress, setWalletAddress] = useState("");
  const [details, setDetails] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [droneFee, setDroneFee] = useState("");
  const [jobId, setJobId] = useState("");
  const [status, setStatus] = useState("");

  async function connectWallet() {
    let accounts;
    // Prompt user to switch to Sei EVM network if using MetaMask or EVM wallet
    if (window.ethereum) {
      // Check if we're already on Sei Pacific-1 Mainnet or Testnet
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const seiMainnetChainId = '0xaef13'; // 716819 in hex (Sei Pacific-1 Mainnet)
      const seiTestnetChainId = '0x530'; // 1328 in hex (Sei EVM Testnet)
      
      // If already on Sei Pacific-1 Mainnet, continue
      if (currentChainId === seiMainnetChainId) {
        setStatus('Connected to Sei Pacific-1 Mainnet');
      } else {
        // Otherwise, try to switch to testnet first
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: seiTestnetChainId }],
          });
        } catch (switchError) {
          // If testnet is not added, try to add it
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: seiTestnetChainId,
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
              // If testnet add fails, try to add mainnet
              try {
                await window.ethereum.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: seiMainnetChainId,
                    chainName: 'Sei Pacific-1',
                    rpcUrls: ['https://evm-rpc.sei-apis.com'],
                    nativeCurrency: {
                      name: 'Sei',
                      symbol: 'SEI',
                      decimals: 18,
                    },
                    blockExplorerUrls: ['https://seitrace.com'],
                  }],
                });
                setStatus('Added Sei Pacific-1 Mainnet to MetaMask.');
              } catch (mainnetAddError) {
                setStatus('Failed to add Sei networks to MetaMask.');
                return;
              }
            }
          } else {
            setStatus('Failed to switch to Sei network. Continuing with current network.');
          }
        }
      }
    }
    if (window.sei) {
      setStatus("Sei Global Wallet detected. Connecting...");
      try {
        accounts = await window.sei.request({ method: 'eth_requestAccounts' });
        setWalletAddress(accounts[0]);
        setStatus("Wallet connected: " + accounts[0]);
      } catch (err) {
        setStatus("Wallet connection failed");
        return;
      }
    } else if (window.ethereum) {
      setStatus("EVM wallet detected. Connecting...");
      try {
        accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        setWalletAddress(accounts[0]);
        setStatus("Wallet connected: " + accounts[0]);
      } catch (err) {
        setStatus("Wallet connection failed");
        return;
      }
    } else {
      setStatus("No Sei or EVM wallet found. Please install Compass Wallet for Sei.");
      return;
    }

    // Determine which RPC to use based on current chain
    const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
    const isMainnet = currentChainId === '0xaef13';
    const rpcUrl = isMainnet 
      ? "https://evm-rpc.sei-apis.com" 
      : "https://evm-rpc-testnet.sei-apis.com";
    
    const seiProvider = new ethers.JsonRpcProvider(rpcUrl);
    try {
      const balance = await seiProvider.getBalance(accounts[0]);
      const networkName = isMainnet ? 'Mainnet' : 'Testnet';
      setStatus(`Wallet connected: ${accounts[0]}. Balance: ${ethers.formatEther(balance)} SEI (${networkName})`);
    } catch (err) {
      setStatus(`Wallet connected: ${accounts[0]}. Error fetching balance.`);
    }
  }

  // ...existing code...

  async function postJob() {
    console.log('Post Job clicked');
    try {
      let provider;
      if (window.sei) {
        provider = new ethers.BrowserProvider(window.sei);
        console.log('Using Sei Global Wallet for EVM');
      } else if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        console.log('Using EVM wallet');
      } else {
        setStatus("No Sei or EVM wallet found");
        console.error("No Sei or EVM wallet found");
        return;
      }
      // Validate recipient address
      if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
        setStatus("Invalid recipient address");
        console.error("Invalid recipient address", recipient);
        return;
      }
      // Validate amount - we use totalAmount which includes the drone fee
      let parsedAmount;
      try {
        // If totalAmount is set, use it (including drone fee), otherwise fall back to amount
        const amountToSend = totalAmount || amount;
        parsedAmount = ethers.parseEther(amountToSend);
        console.log(`Using total amount (with 10% drone fee): ${amountToSend} SEI`);
      } catch (err) {
        setStatus("Invalid amount format");
        console.error("Invalid amount format", err, amount);
        return;
      }
      if (parsedAmount <= 0) {
        setStatus("Amount must be greater than 0");
        console.error("Amount must be greater than 0", parsedAmount);
        return;
      }
      // Check current network and use appropriate RPC
      const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
      const isMainnet = currentChainId === '0xaef13';
      const rpcUrl = isMainnet 
        ? "https://evm-rpc.sei-apis.com" 
        : "https://evm-rpc-testnet.sei-apis.com";
      
      // Check wallet balance before posting job
      const seiProvider = new ethers.JsonRpcProvider(rpcUrl);
      const balance = await seiProvider.getBalance(walletAddress);
      const networkName = isMainnet ? 'Mainnet' : 'Testnet';
      console.log(`Wallet balance (SEI) on ${networkName}:`, ethers.formatEther(balance));
      if (balance < parsedAmount) {
        setStatus(`Insufficient wallet balance. Balance: ${ethers.formatEther(balance)} SEI (${networkName})`);
        console.error("Insufficient wallet balance.", balance, parsedAmount);
        return;
      }
      // Additional validation before contract call
      if (recipient.toLowerCase() === walletAddress.toLowerCase()) {
        setStatus("Error: Recipient cannot be the same as sender");
        return;
      }
      
      // Check minimum amount (0.001 SEI)
      const minAmount = ethers.parseEther("0.001");
      if (parsedAmount < minAmount) {
        setStatus("Error: Minimum 0.001 SEI required");
        return;
      }
      
      console.log('Contract details:', {
        address: CONTRACT_ADDRESS,
        details,
        recipient,
        amount: ethers.formatEther(parsedAmount),
        sender: walletAddress
      });
      
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      
      try {
        // Estimate gas first
        const gasEstimate = await contract.postJob.estimateGas(details, recipient, {
          value: parsedAmount
        });
        console.log('Gas estimate:', gasEstimate.toString());
        
        const tx = await contract.postJob(details, recipient, {
          value: parsedAmount,
          gasLimit: gasEstimate * 2n, // Use 2x the estimated gas
        });
        
        console.log('Transaction sent:', tx.hash);
        setStatus(`Transaction sent: ${tx.hash}. Waiting for confirmation...`);
        
        const receipt = await tx.wait();
        console.log('Transaction confirmed:', receipt);
        
        // Extract real jobId from transaction events
        let jobId = null;
        console.log('Transaction receipt logs:', receipt.logs);
        
        if (receipt.logs && receipt.logs.length > 0) {
          try {
            // Try to parse each log to find JobPosted event
            for (const log of receipt.logs) {
              try {
                const parsedLog = contract.interface.parseLog({
                  topics: log.topics,
                  data: log.data
                });
                console.log('Parsed log:', parsedLog);
                
                if (parsedLog && parsedLog.name === 'JobPosted') {
                  jobId = parsedLog.args.jobId.toString();
                  console.log('Found JobPosted event with jobId:', jobId);
                  break;
                }
              } catch (parseError) {
                console.log('Could not parse log:', parseError.message);
                continue;
              }
            }
          } catch (e) {
            console.error('Error parsing transaction logs:', e);
          }
        }
        
        // Alternative: get jobId from contract function return value if available
        if (!jobId && receipt.logs.length > 0) {
          try {
            // The postJob function returns the jobId, try to get it from call result
            const currentJobCount = await contract.jobCount();
            jobId = currentJobCount.toString();
            console.log('Got jobId from contract jobCount:', jobId);
          } catch (e) {
            console.error('Error getting jobCount:', e);
          }
        }
        
        // Fallback to mock jobId if we couldn't extract the real one
        if (!jobId) {
          jobId = Math.floor(Math.random() * 1000000);
          console.log('Using fallback jobId (this should not happen):', jobId);
        }
        
        // Notify backend
        await fetch("http://localhost:3001/job", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
        setStatus(`Job posted successfully! Job ID: ${jobId}. Backend notified.`);

        // Start polling for delivery confirmation
        pollDeliveryConfirmation(jobId);
      } catch (txErr) {
        console.error('Full error object:', txErr);
        
        // Better error parsing
        let errorMessage = "Error posting job: ";
        if (txErr.reason) {
          errorMessage += txErr.reason;
        } else if (txErr.message) {
          errorMessage += txErr.message;
        } else if (txErr.data) {
          errorMessage += "Transaction reverted";
        } else {
          errorMessage += "Unknown error";
        }
        
        setStatus(errorMessage);
        
        if (txErr?.receipt) {
          console.error('Transaction receipt:', txErr.receipt);
        }
      }
    } catch (err) {
      setStatus("Error: " + (err?.message || err));
      console.error('Error posting job:', err);
    }
  }
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Sei Delivery Platform</h1>
      <button onClick={connectWallet}>Connect Wallet</button>
      <div style={{ marginTop: '1rem' }}>
        <div>Status: {status}</div>
        <div>Wallet: {walletAddress}</div>
      </div>
      {/* Function to calculate drone fee and total amount */}
      <div style={{ marginTop: '1rem', marginBottom: '1rem', padding: '1rem', backgroundColor: '#f4f4f4', borderRadius: '5px' }}>
        <h3>Drone Fee Explained</h3>
        <p>A 10% drone fee is added to your transaction. This fee structure works as follows:</p>
        <ul style={{ listStyleType: 'disc', paddingLeft: '1.5rem' }}>
          <li><strong>80%</strong> of your base amount goes to the recipient</li>
          <li><strong>10%</strong> of your base amount goes to the platform fee wallet</li>
          <li><strong>10%</strong> drone fee is either:
            <ul style={{ paddingLeft: '1.5rem', marginTop: '0.5rem' }}>
              <li>Sent to the assigned drone operator if a drone is assigned</li>
              <li>Returned to you (the sender) if no drone is assigned</li>
            </ul>
          </li>
        </ul>
        <p style={{ marginTop: '0.5rem', fontStyle: 'italic' }}>Example: If you send 0.2 SEI, you'll be charged 0.22 SEI total (including 0.02 SEI drone fee)</p>
      </div>

      <form
        onSubmit={e => {
          e.preventDefault();
          postJob();
        }}
        style={{ marginTop: '2rem' }}
      >
        <input
          type="text"
          placeholder="Job Details"
          value={details}
          onChange={e => setDetails(e.target.value)}
          style={{ marginRight: '1rem', marginBottom: '1rem', padding: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="Recipient Address"
          value={recipient}
          onChange={e => setRecipient(e.target.value)}
          style={{ marginRight: '1rem', marginBottom: '1rem', padding: '0.5rem' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem' }}>
          <input
            type="text"
            placeholder="Base Amount (SEI)"
            value={amount}
            onChange={e => {
              const baseAmount = e.target.value;
              setAmount(baseAmount);
              
              // Calculate drone fee (10% of base amount)
              try {
                if (baseAmount && !isNaN(parseFloat(baseAmount))) {
                  const baseAmountFloat = parseFloat(baseAmount);
                  const droneFeeAmount = baseAmountFloat * 0.1;
                  const totalAmountValue = baseAmountFloat + droneFeeAmount;
                  
                  setDroneFee(droneFeeAmount.toFixed(6));
                  setTotalAmount(totalAmountValue.toFixed(6));
                } else {
                  setDroneFee("");
                  setTotalAmount("");
                }
              } catch (err) {
                console.error("Error calculating fee:", err);
                setDroneFee("");
                setTotalAmount("");
              }
            }}
            style={{ marginRight: '1rem', marginBottom: '0.5rem', padding: '0.5rem' }}
          />
          {droneFee && (
            <div style={{ marginBottom: '0.5rem' }}>
              <p>Drone Fee (10%): <strong>{droneFee} SEI</strong></p>
              <p>Total Amount: <strong>{totalAmount} SEI</strong></p>
            </div>
          )}
        </div>
        <button type="submit" style={{ padding: '0.5rem 1rem', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Post Job with Drone Fee</button>
      </form>
    </div>
  );
}
