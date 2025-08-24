"use client";

export default function DroneCard({ drone, isSelected = false }) {
  if (!drone) return null;

  const truncateAddress = (address, start = 6, end = 4) => {
    if (!address) return '';
    return `${address.slice(0, start)}...${address.slice(-end)}`;
  };

  return (
    <div className={`p-6 rounded-lg border ${isSelected ? 'border-drone-highlight bg-drone-highlight/10' : 'border-drone-charcoal bg-drone-graphite/30'} backdrop-blur-sm`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <h4 className={`font-orbitron text-xl font-bold ${isSelected ? 'text-drone-highlight' : 'text-white'} mb-1`}>
            {drone.name || drone.id}
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Status:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
              drone.status === 'available' 
                ? 'bg-green-400/20 text-green-400' 
                : drone.status === 'assigned' 
                  ? 'bg-yellow-400/20 text-yellow-400'
                  : 'bg-gray-400/20 text-gray-400'
            }`}>
              {drone.status?.toUpperCase()}
            </span>
          </div>
        </div>
        {isSelected && (
          <div className="px-3 py-2 bg-drone-highlight text-black text-xs font-bold rounded-lg">
            ASSIGNED
          </div>
        )}
      </div>
      
      {/* Drone Properties - Better Grid Layout */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="text-center p-3 bg-drone-charcoal/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Battery</div>
          <div className={`text-lg font-bold ${
            (drone.properties?.currentBattery || 0) > 80 ? 'text-green-400' : 
            (drone.properties?.currentBattery || 0) > 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {drone.properties?.currentBattery || 0}%
          </div>
        </div>
        
        <div className="text-center p-3 bg-drone-charcoal/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Capacity</div>
          <div className="text-lg font-bold text-drone-highlight">
            {drone.properties?.maxCapacity || 0}kg
          </div>
        </div>
        
        <div className="text-center p-3 bg-drone-charcoal/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Range</div>
          <div className="text-lg font-bold text-gray-300">
            {drone.properties?.maxRange || 0}km
          </div>
        </div>
        
        <div className="text-center p-3 bg-drone-charcoal/30 rounded-lg">
          <div className="text-xs text-gray-400 mb-1">Speed</div>
          <div className="text-lg font-bold text-gray-300">
            {drone.properties?.speed || 0}km/h
          </div>
        </div>
      </div>
      
      {/* Location Information */}
      {drone.location && (
        <div className="mb-4 p-3 bg-drone-charcoal/20 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400">📍 Location:</span>
          </div>
          <div className="text-sm text-gray-300 font-mono">
            {drone.location.lat?.toFixed(4)}, {drone.location.lng?.toFixed(4)}
          </div>
          {drone.location.address && (
            <div className="text-sm text-gray-300 mt-1">
              {drone.location.address}
            </div>
          )}
        </div>
      )}
      
      {/* Wallet Address */}
      {drone.walletAddress && (
        <div className="mb-4 p-3 bg-drone-charcoal/20 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">🔗 Drone Wallet:</span>
            <button 
              onClick={() => navigator.clipboard.writeText(drone.walletAddress)}
              className="text-xs text-drone-highlight hover:text-white transition-colors"
            >
              Copy
            </button>
          </div>
          <div className="text-sm text-gray-300 font-mono mt-1">
            {truncateAddress(drone.walletAddress, 8, 6)}
          </div>
        </div>
      )}
      
      {/* Hive Intelligence Metrics */}
      {drone.hiveMind && (
        <div className="p-3 bg-drone-charcoal/20 rounded-lg">
          <div className="text-xs text-gray-400 mb-2">🧠 Hive Intelligence</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Efficiency:</span>
              <span className="text-green-400">{(drone.hiveMind.efficiency * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Reliability:</span>
              <span className="text-green-400">{(drone.hiveMind.reliability * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
