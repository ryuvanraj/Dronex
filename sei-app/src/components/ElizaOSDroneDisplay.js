"use client";

import { useState, useEffect } from "react";
import DroneCard from "@/components/DroneCard";
import MapInterface from "@/components/MapInterface";

export default function ElizaOSDroneDisplay({ orderId, onDataUpdate, selectedDrone, assignmentData }) {
  const [droneData, setDroneData] = useState(null);
  const [hiveStatus, setHiveStatus] = useState(null);
  const [assignedDrone, setAssignedDrone] = useState(selectedDrone);
  const [jobStatus, setJobStatus] = useState(assignmentData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Update local state when props change
  useEffect(() => {
    if (selectedDrone) {
      setAssignedDrone(selectedDrone);
    }
    if (assignmentData) {
      setJobStatus(assignmentData);
    }
  }, [selectedDrone, assignmentData]);

  useEffect(() => {
    if (!orderId) return;

    const fetchDroneData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // First, check if there's already an assigned drone for this order
        const jobResponse = await fetch(`http://localhost:3001/api/drone/job-status/${orderId}`);
        if (jobResponse.ok) {
          const jobData = await jobResponse.json();
          if (jobData.success && jobData.job) {
            setAssignedDrone(jobData.job.drone);
            setJobStatus(jobData.job);
            
            // Call the callback with assigned drone data
            if (onDataUpdate) {
              onDataUpdate({
                selectedDrone: jobData.job.drone,
                assignmentData: jobData.job
              });
            }
          }
        }
        
        // Fetch available drones
        const dronesResponse = await fetch('http://localhost:3001/api/drones/available');
        if (!dronesResponse.ok) {
          throw new Error('Failed to fetch drone data');
        }
        const dronesData = await dronesResponse.json();
        
        // Fetch hive intelligence
        const hiveResponse = await fetch('http://localhost:3001/api/hive/status');
        if (!hiveResponse.ok) {
          throw new Error('Failed to fetch hive status');
        }
        const hiveData = await hiveResponse.json();
        
        setDroneData(dronesData);
        setHiveStatus(hiveData);
        
        // Call the callback with the data
        if (onDataUpdate) {
          onDataUpdate({
            drones: dronesData,
            hive: hiveData,
            selectedDrone: assignedDrone,
            assignmentData: jobStatus
          });
        }
        
      } catch (err) {
        console.error('Error fetching ElizaOS data:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDroneData();
    
    // Set up polling for real-time updates
    const interval = setInterval(fetchDroneData, 10000); // Poll every 10 seconds
    
    return () => clearInterval(interval);
  }, [orderId, onDataUpdate]);

  if (isLoading && !droneData) {
    return (
      <div className="hud-card p-6 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-drone-highlight mx-auto"></div>
        <p className="text-gray-400 mt-2">Connecting to ElizaOS Hive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hud-card p-6 text-center">
        <p className="text-red-400">⚠️ Error: {error}</p>
        <p className="text-gray-500 text-sm mt-2">Unable to connect to drone management system</p>
      </div>
    );
  }

  if (!droneData) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Assigned Drone Display */}
      {assignedDrone && (
        <div className="hud-card p-6 border-2 border-drone-highlight">
          <h3 className="font-orbitron text-xl text-drone-highlight mb-4 flex items-center gap-2">
            <span>🚁 Assigned Drone</span>
            <span className="text-xs bg-green-400/20 text-green-400 px-2 py-1 rounded-full">ACTIVE</span>
          </h3>
          <DroneCard drone={assignedDrone} isSelected={true} />
          {jobStatus && (
            <div className="mt-6 p-4 bg-drone-charcoal/30 rounded-lg">
              <h4 className="text-sm font-semibold text-drone-highlight mb-3">📊 Job Status</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-3 bg-drone-charcoal/50 rounded-lg">
                  <div className="text-xs text-gray-400 mb-1">Status</div>
                  <div className={`text-sm font-semibold ${jobStatus.status === 'assigned' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {jobStatus.status?.toUpperCase() || 'PROCESSING'}
                  </div>
                </div>
                {jobStatus.estimatedDeliveryTime && (
                  <div className="text-center p-3 bg-drone-charcoal/50 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1">ETA</div>
                    <div className="text-sm font-semibold text-drone-highlight">
                      {jobStatus.estimatedDeliveryTime} min
                    </div>
                  </div>
                )}
                {jobStatus.assignedAt && (
                  <div className="text-center p-3 bg-drone-charcoal/50 rounded-lg">
                    <div className="text-xs text-gray-400 mb-1">Assigned</div>
                    <div className="text-sm font-semibold text-gray-300">
                      {new Date(jobStatus.assignedAt).toLocaleTimeString()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hive Intelligence Status - Perfect Alignment */}
      {hiveStatus && (
        <div className="hud-card p-6 bg-drone-graphite/20 border border-drone-charcoal">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-drone-highlight rounded-full flex items-center justify-center shadow-lg">
                <span className="text-2xl">🧠</span>
              </div>
              <div>
                <h3 className="font-orbitron text-2xl font-bold text-white mb-1">Hive Intelligence</h3>
                <span className={`inline-block text-xs px-3 py-1 rounded-full font-semibold ${
                  hiveStatus.hiveIntelligence?.status === 'online' 
                    ? 'bg-green-400/20 text-green-400 border border-green-400/40' 
                    : 'bg-red-400/20 text-red-400 border border-red-400/40'
                }`}>
                  {hiveStatus.hiveIntelligence?.status?.toUpperCase() || 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Metrics Grid - Perfect Alignment */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Connected Drones */}
            <div className="flex flex-col items-center justify-center p-6 bg-drone-charcoal/40 rounded-xl border border-drone-charcoal/60 hover:border-drone-highlight/40 transition-all duration-300 min-h-[120px]">
              <div className="text-3xl font-bold text-drone-highlight mb-3 leading-none">
                {hiveStatus.hiveIntelligence?.connectedDrones || 0}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide text-center font-semibold">
                Connected<br/>Drones
              </div>
            </div>

            {/* Success Rate */}
            <div className="flex flex-col items-center justify-center p-6 bg-drone-charcoal/40 rounded-xl border border-drone-charcoal/60 hover:border-green-400/40 transition-all duration-300 min-h-[120px]">
              <div className="text-1xl font-bold text-green-400 mb-3 leading-none">
                {hiveStatus.hiveIntelligence?.successRate || 0}%
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide text-center font-semibold">
                Success<br/>Rate
              </div>
            </div>

            {/* Network Health */}
            <div className="flex flex-col items-center justify-center p-6 bg-drone-charcoal/40 rounded-xl border border-drone-charcoal/60 hover:border-blue-400/40 transition-all duration-300 min-h-[120px]">
              <div className={`text-lg font-bold mb-3 leading-none text-center ${
                hiveStatus.hiveIntelligence?.networkHealth === 'optimal' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {(hiveStatus.hiveIntelligence?.networkHealth || 'UNKNOWN').toUpperCase()}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide text-center font-semibold">
                Network<br/>Health
              </div>
            </div>

            {/* Active Jobs */}
            <div className="flex flex-col items-center justify-center p-6 bg-drone-charcoal/40 rounded-xl border border-drone-charcoal/60 hover:border-purple-400/40 transition-all duration-300 min-h-[120px]">
              <div className="text-3xl font-bold text-purple-400 mb-3 leading-none">
                {hiveStatus.hiveIntelligence?.activeOperations || 0}
              </div>
              <div className="text-xs text-gray-400 uppercase tracking-wide text-center font-semibold">
                Active<br/>Jobs
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Available Drones - Only show if no drone is assigned */}
      {!assignedDrone && droneData?.availableDrones && droneData.availableDrones.length > 0 && (
        <div className="hud-card p-6">
          <h3 className="font-orbitron text-xl text-drone-highlight mb-4">🚁 Available Drones</h3>
          <div className="grid gap-6 lg:grid-cols-1">
            {droneData.availableDrones.slice(0, 2).map((drone) => (
              <DroneCard key={drone.id} drone={drone} />
            ))}
          </div>
        </div>
      )}

      {/* Fleet Overview Map */}
      {droneData?.availableDrones && droneData.availableDrones.length > 0 && (
        <div className="hud-card p-6">
          <h3 className="font-orbitron text-xl text-drone-highlight mb-4">📍 Fleet Overview</h3>
          <div className="h-64 bg-drone-charcoal/30 rounded-lg flex items-center justify-center">
            <MapInterface 
              drones={assignedDrone ? [assignedDrone] : droneData.availableDrones} 
              selectedDrone={assignedDrone}
            />
          </div>
        </div>
      )}
    </div>
  );
}
