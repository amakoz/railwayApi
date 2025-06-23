import { setupLogging } from '../utils/logger';
import { getAllCoasters, getWagonsByCoasterId } from './dataService';
import { Coaster, Wagon } from '../models';
import { getConnectedNodesCount, isMaster } from './redisService';

const logger = setupLogging();

// Constants for calculations
const WAGON_PERSONNEL_REQUIRED = 2; // 2 personnel per wagon
const COASTER_BASE_PERSONNEL = 1;   // 1 base personnel per coaster
const WAGON_REST_TIME = 5;          // 5 minutes rest time for each wagon

interface CoasterStatus {
  id: string;
  name?: string; // Optional name for display purposes
  hoursFrom: string;
  hoursTo: string;
  wagonCount: {
    current: number;
    required: number;
    safe: number; // Maximum number of wagons that can safely operate
  };
  personnel: {
    current: number;
    required: number;
    status: 'OK' | 'SHORTAGE' | 'EXCESS';
    difference: number;
  };
  clients: {
    daily: number;
    serviceCapacity: number;
    fulfillmentPercent: number;
  };
  status: 'OK' | 'PROBLEM';
  details: string[];
}

interface SystemStatus {
  timestamp: string;
  connectedNodes: number;
  isMasterNode: boolean;
  coasterCount: number;
  totalWagons: number;
  totalPersonnel: number;
  totalClients: number;
}

// Calculate time in minutes from a string like "8:00"
const timeStringToMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

// Calculate the number of clients a coaster can serve in a day
const calculateDailyCapacity = (
  coaster: Coaster,
  wagons: Wagon[]
): number => {
  // Calculate the total operation time in minutes
  const startMinutes = timeStringToMinutes(coaster.hoursFrom);
  const endMinutes = timeStringToMinutes(coaster.hoursTo);
  const operationMinutes = endMinutes - startMinutes;

  if (operationMinutes <= 0 || wagons.length === 0) {
    return 0;
  }

  // Calculate average speed and capacity across all wagons
  const totalSpeed = wagons.reduce((sum, wagon) => sum + wagon.wagonSpeed, 0);
  const avgSpeed = totalSpeed / wagons.length;  // in m/s

  const totalCapacity = wagons.reduce((sum, wagon) => sum + wagon.seatCount, 0);

  // Calculate time for one round of the track
  const trackLength = coaster.trackLength; // in meters
  const roundTripTime = (trackLength / avgSpeed) / 60; // in minutes (including return trip)

  // Add rest time for each round
  const totalRoundTime = roundTripTime + WAGON_REST_TIME;

  // Make sure the last trip can finish before closing time
  // Last trip should start at least roundTripTime minutes before closing
  const safeOperationMinutes = Math.max(0, operationMinutes - roundTripTime);

  // Calculate how many rounds each wagon can make
  const roundsPerWagon = Math.floor(safeOperationMinutes / totalRoundTime);

  // Calculate total daily capacity
  const dailyCapacity = totalCapacity * roundsPerWagon * wagons.length;

  return Math.floor(dailyCapacity);
};

// Calculate how many wagons are needed to serve the desired number of clients
const calculateRequiredWagons = (
  coaster: Coaster,
  avgWagonCapacity: number,
  avgWagonSpeed: number
): number => {
  if (avgWagonCapacity <= 0 || avgWagonSpeed <= 0) {
    return 1; // Default to at least 1 wagon
  }

  // Calculate operation time
  const startMinutes = timeStringToMinutes(coaster.hoursFrom);
  const endMinutes = timeStringToMinutes(coaster.hoursTo);
  const operationMinutes = endMinutes - startMinutes;

  if (operationMinutes <= 0) {
    return 1;
  }

  // Calculate round trip time with rest
  const trackLength = coaster.trackLength; // in meters
  const roundTripTime = (trackLength / avgWagonSpeed) / 60 + WAGON_REST_TIME; // in minutes

  // Make sure the last trip can finish before closing time
  const safeOperationMinutes = Math.max(0, operationMinutes - (trackLength / avgWagonSpeed) / 60);

  // Calculate rounds per day per wagon
  const roundsPerDay = Math.floor(safeOperationMinutes / roundTripTime);

  if (roundsPerDay <= 0) {
    logger.warn(`Coaster ${coaster.id} has insufficient operating time for its track length`);
    return 999; // Signal an error condition
  }

  // Calculate required capacity per round
  const requiredCapacityPerRound = coaster.clientCount / roundsPerDay;

  // Calculate number of wagons needed
  const requiredWagons = Math.ceil(requiredCapacityPerRound / avgWagonCapacity);

  return Math.max(1, requiredWagons); // At least 1 wagon
};

// Calculate the max number of wagons that can safely complete their routes
const calculateMaxSafeWagons = (
  coaster: Coaster,
  avgWagonSpeed: number
): number => {
  const startMinutes = timeStringToMinutes(coaster.hoursFrom);
  const endMinutes = timeStringToMinutes(coaster.hoursTo);
  const operationMinutes = endMinutes - startMinutes;

  // Calculate time for one trip
  const trackLength = coaster.trackLength; // in meters
  const oneWayTripTime = (trackLength / avgWagonSpeed) / 60; // in minutes

  // Check if there's enough time for at least one round trip
  if (operationMinutes <= oneWayTripTime * 2 + WAGON_REST_TIME) {
    logger.warn(`Coaster ${coaster.id} has insufficient operation time for a complete round trip`);
    return 0;
  }

  // In theory, the maximum number of wagons is unlimited as they operate in parallel
  // But we'll set a reasonable limit based on track length and safety considerations
  // For simplicity, we'll assume a safety distance between wagons
  const safetyMinDistance = 100; // meters between wagons
  const maxSafeWagons = Math.floor(coaster.trackLength / safetyMinDistance);

  return Math.max(1, maxSafeWagons); // At least 1 wagon
};

// Calculate required personnel for a coaster
const calculateRequiredPersonnel = (
  coaster: Coaster,
  wagonCount: number
): number => {
  // Base personnel for the coaster + personnel for each wagon
  return COASTER_BASE_PERSONNEL + (wagonCount * WAGON_PERSONNEL_REQUIRED);
};

// Get the status of all coasters
export const getCoasterStatuses = (): CoasterStatus[] => {
  const coasters = getAllCoasters();
  return coasters.map(coaster => getCoasterStatus(coaster));
};

// Get the status of a single coaster
export const getCoasterStatus = (coaster: Coaster): CoasterStatus => {
  const wagons = getWagonsByCoasterId(coaster.id);

  // Calculate the average wagon capacity and speed for this coaster
  let avgWagonCapacity: number;
  let avgWagonSpeed: number;

  if (wagons.length > 0) {
    avgWagonCapacity = wagons.reduce((sum, wagon) => sum + wagon.seatCount, 0) / wagons.length;
    avgWagonSpeed = wagons.reduce((sum, wagon) => sum + wagon.wagonSpeed, 0) / wagons.length;
  } else {
    // Default values if no wagons
    avgWagonCapacity = 30;
    avgWagonSpeed = 1.0;
  }

  // Calculate maximum safe number of wagons
  const maxSafeWagons = calculateMaxSafeWagons(coaster, avgWagonSpeed);

  // Calculate actual daily capacity with current wagons
  const dailyCapacity = calculateDailyCapacity(coaster, wagons);

  // Calculate required wagons to meet the client demand
  const requiredWagons = calculateRequiredWagons(
    coaster,
    avgWagonCapacity,
    avgWagonSpeed
  );

  // Calculate current and required personnel
  const currentPersonnel = coaster.staffCount;
  const requiredPersonnel = calculateRequiredPersonnel(coaster, requiredWagons);

  // Determine if there's a personnel shortage or excess
  let personnelStatus: 'OK' | 'SHORTAGE' | 'EXCESS' = 'OK';
  let personnelDifference = currentPersonnel - requiredPersonnel;

  if (personnelDifference < 0) {
    personnelStatus = 'SHORTAGE';
    personnelDifference = Math.abs(personnelDifference);
  } else if (personnelDifference > requiredPersonnel * 0.5) { // More than 50% excess
    personnelStatus = 'EXCESS';
  }

  // Determine status and details
  let status: 'OK' | 'PROBLEM' = "OK";
  const details: string[] = [];

  // Check for personnel issues
  if (currentPersonnel < requiredPersonnel) {
    status = "PROBLEM";
    details.push(`Brakuje ${requiredPersonnel - currentPersonnel} pracowników`);
  } else if (currentPersonnel > requiredPersonnel * 1.5) { // 50% more than needed
    status = "PROBLEM";
    details.push(`Nadmiar ${currentPersonnel - requiredPersonnel} pracowników`);
  }

  // Check for wagon issues
  if (wagons.length < requiredWagons) {
    status = "PROBLEM";
    details.push(`Brak ${requiredWagons - wagons.length} wagonów`);
  } else if (dailyCapacity > coaster.clientCount * 2) { // More than 2x capacity
    status = "PROBLEM";
    details.push(`Nadmiar ${wagons.length - requiredWagons} wagonów`);
  }

  // Check if we have more wagons than can safely operate
  if (wagons.length > maxSafeWagons) {
    status = "PROBLEM";
    details.push(`Zbyt wiele wagonów dla bezpiecznej operacji, maksimum: ${maxSafeWagons}`);
  }

  // If empty, set OK status
  if (details.length === 0) {
    details.push("Wszystko działa poprawnie");
  }

  // Calculate percentage of client capacity fulfillment
  const percentCapacity = dailyCapacity > 0 ?
    Math.min(Math.round((dailyCapacity / coaster.clientCount) * 100), 100) : 0;

  return {
    id: coaster.id,
    hoursFrom: coaster.hoursFrom,
    hoursTo: coaster.hoursTo,
    wagonCount: {
      current: wagons.length,
      required: requiredWagons,
      safe: maxSafeWagons
    },
    personnel: {
      current: currentPersonnel,
      required: requiredPersonnel,
      status: personnelStatus,
      difference: personnelDifference
    },
    clients: {
      daily: coaster.clientCount,
      serviceCapacity: dailyCapacity,
      fulfillmentPercent: percentCapacity
    },
    status,
    details,
  };
};

// Get overall system status
const getSystemStatus = (): SystemStatus => {
  const coasters = getAllCoasters();
  const statuses = coasters.map(coaster => getCoasterStatus(coaster));

  const totalWagons = statuses.reduce((sum, status) => sum + status.wagonCount.current, 0);
  const totalPersonnel = statuses.reduce((sum, status) => sum + status.personnel.current, 0);
  const totalClients = statuses.reduce((sum, status) => sum + status.clients.daily, 0);

  return {
    timestamp: new Date().toISOString(),
    connectedNodes: getConnectedNodesCount(),
    isMasterNode: isMaster(),
    coasterCount: coasters.length,
    totalWagons,
    totalPersonnel,
    totalClients
  };
};

// Format time as HH:MM
const formatTime = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

// Start monitoring and display stats
const startMonitoring = () => {
  const displayStats = () => {
    const statuses = getCoasterStatuses();
    const systemStatus = getSystemStatus();

    console.log("\n");
    console.log(`[Godzina ${formatTime()}]`);
    console.log(`Status systemu: ${systemStatus.connectedNodes} połączonych węzłów, ${systemStatus.isMasterNode ? 'WĘZEŁ GŁÓWNY' : 'WĘZEŁ PODRZĘDNY'}`);
    console.log(`Całkowita pojemność systemu: ${statuses.length} kolejek, ${systemStatus.totalWagons} wagonów, ${systemStatus.totalPersonnel} personelu, ${systemStatus.totalClients} klientów dziennie`);
    console.log("\n");

    if (statuses.length === 0) {
      console.log("Brak zarejestrowanych kolejek w systemie");
    }

    statuses.forEach(status => {
      console.log(`[Kolejka ${status.id}]`);
      console.log(`1. Godziny działania: ${status.hoursFrom} - ${status.hoursTo}`);
      console.log(`2. Liczba wagonów: ${status.wagonCount.current}/${status.wagonCount.required} (max bezpiecznie: ${status.wagonCount.safe})`);
      console.log(`3. Dostępny personel: ${status.personnel.current}/${status.personnel.required}`);
      console.log(`4. Klienci dziennie: ${status.clients.daily} (obsługa: ${Math.round(status.clients.fulfillmentPercent)}%)`);
      console.log(`5. Status: ${status.status}`);

      if (status.status !== "OK") {
        console.log(`6. Problem: ${status.details.join(', ')}`);
      }

      console.log("\n");
    });
  };

  // Display stats immediately and then every 30 seconds
  displayStats();
  setInterval(displayStats, 30000);
};

export const monitoringService = {
  getCoasterStatus,
  getCoasterStatuses,
  getSystemStatus,
  startMonitoring,
};
