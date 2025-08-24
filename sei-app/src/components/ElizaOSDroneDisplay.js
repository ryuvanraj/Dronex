"use client";

import { useState, useEffect } from 'react';

// Backend URL configuration - can be overridden by environment variable
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const ElizaOSDroneDisplay = ({ orderId, onDataUpdate }) => {
  const [elizaData, setElizaData] = useState(null);
  const [hiveData, setHiveData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  useEffect(() => {
    const fetchDroneData = async () => {
      try {
        setConnectionStatus('connecting');
        
        // Test basic connectivity first
        const pingResponse = await fetch(`${BACKEND_URL}/api/drone/info`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!pingResponse.ok) {
          throw new Error(`Backend not reachable: ${pingResponse.status} ${pingResponse.statusText}`);
        }
        
        // Fetch ElizaOS status
        const elizaResponse = await fetch(`${BACKEND_URL}/api/drone/eliza-status`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (elizaResponse.ok) {
          const elizaResult = await elizaResponse.json();
          setElizaData(elizaResult);
        } else {
          console.warn('ElizaOS endpoint not available:', elizaResponse.status);
        }

        // Fetch Hive Intelligence data
        const hiveResponse = await fetch(`${BACKEND_URL}/api/drone/hive-intelligence`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (hiveResponse.ok) {
          const hiveResult = await hiveResponse.json();
          setHiveData(hiveResult);
        } else {
          console.warn('Hive Intelligence endpoint not available:', hiveResponse.status);
        }

        setIsLoading(false);
        setConnectionStatus('connected');
        setError(null);
        
        // Call parent component update if provided
        if (onDataUpdate) {
          onDataUpdate({ eliza: elizaData, hive: hiveData });
        }
        
      } catch (err) {
        console.error('🚨 Backend Connection Error');
        console.error('Could not connect to ElizaOS backend:', err.message);
        console.error('');
        console.error('Make sure the sei-so backend is running on localhost:3001');
        
        setError(`Backend Connection Error: ${err.message}`);
        setConnectionStatus('error');
        setIsLoading(false);
      }
    };

    // Initial fetch
    fetchDroneData();

    // Set up polling every 5 seconds for real-time updates
    const interval = setInterval(fetchDroneData, 5000);

    return () => clearInterval(interval);
  }, [orderId, onDataUpdate]);

  if (isLoading) {
    return (
      <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-6 h-6 border-2 border-drone-highlight border-t-transparent rounded-full animate-spin"></div>
          <h3 className="text-lg font-orbitron text-drone-highlight">Connecting to ElizaOS...</h3>
        </div>
        <p className="text-gray-400">Fetching drone intelligence data from {BACKEND_URL}</p>
      </div>
    );
  }

  if (error || connectionStatus === 'error') {
    return (
      <div className="bg-red-900/20 backdrop-blur-sm border border-red-700 rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-3 h-3 bg-red-400 rounded-full"></div>
          <h3 className="text-lg font-orbitron text-red-400">🚨 Backend Connection Error</h3>
        </div>
        <p className="text-gray-400 mb-2">Could not connect to ElizaOS backend: {error || 'Connection failed'}</p>
        <div className="bg-red-950/50 rounded-lg p-3 space-y-1">
          <p className="text-sm text-gray-300">Backend URL: <span className="text-red-300">{BACKEND_URL}</span></p>
          <p className="text-sm text-gray-300">Status: <span className="text-red-300">{connectionStatus}</span></p>
          <p className="text-sm text-gray-400 mt-2">Make sure the sei-so backend is running on localhost:3001</p>
        </div>
        <button 
          onClick={() => window.location.reload()} 
          className="mt-4 px-4 py-2 bg-red-600/20 border border-red-500 text-red-300 rounded-lg hover:bg-red-600/30 transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ElizaOS Status */}
      {elizaData && (
        <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <h3 className="text-lg font-orbitron text-drone-highlight">🤖 ElizaOS Agent Status</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-gray-300"><span className="text-drone-highlight">Agent:</span> {elizaData.agent || 'Active'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Status:</span> {elizaData.droneStatus || 'Dispatching'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Network:</span> {elizaData.network || 'Sei Atlantic-2'}</p>
            </div>
            <div>
              <p className="text-gray-300"><span className="text-drone-highlight">Uptime:</span> {elizaData.uptime || '99.9%'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Version:</span> {elizaData.version || '1.0.0'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Last Update:</span> {new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Hive Intelligence */}
      {hiveData && (
        <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse"></div>
            <h3 className="text-lg font-orbitron text-drone-highlight">🧠 Hive Intelligence Network</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-gray-300"><span className="text-drone-highlight">Network Status:</span> {hiveData.networkStatus || 'Connected'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Route Optimization:</span> {hiveData.routeOptimization || 'Active'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Traffic Analysis:</span> {hiveData.trafficAnalysis || 'Real-time'}</p>
            </div>
            <div>
              <p className="text-gray-300"><span className="text-drone-highlight">Weather Data:</span> {hiveData.weatherStatus || 'Clear'}</p>
              <p className="text-gray-300"><span className="text-drone-highlight">Fleet Coordination:</span> {hiveData.fleetStatus || 'Synchronized'}</p>
              {hiveData.droneWallet && (
                <p className="text-gray-300">
                  <span className="text-drone-highlight">Drone Wallet:</span> 
                  <span className="font-mono text-sm bg-black/30 px-2 py-1 rounded ml-2">
                    {hiveData.droneWallet.slice(0, 8)}...{hiveData.droneWallet.slice(-6)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Flow Status */}
      <div className="bg-drone-graphite/30 backdrop-blur-sm border border-drone-charcoal rounded-lg p-6">
        <h3 className="text-lg font-orbitron text-drone-highlight mb-4">💰 Payment Flow Status</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-gray-300">User Wallet Connected: <span className="text-green-400">0x2B5c206516c34896D41DB511BAB9E878F8C1C109</span></span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-gray-300">Shop Owner Wallet: <span className="text-green-400">0xA50050DBDBe672a5F0261e403909bCB8590B9130</span></span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
            <span className="text-gray-300">SEI Transfer: <span className="text-blue-400">Processing via Sei Atlantic-2</span></span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ElizaOSDroneDisplay;
