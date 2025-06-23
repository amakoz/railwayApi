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
  godzinaOd: string;
  godzinaDo: string;
  liczbaWagonow: {
    current: number;
    required: number;
    safe: number; // Maximum number of wagons that can safely operate
  };
  personel: {
    current: number;
    required: number;
    status: 'OK' | 'BRAK' | 'NADMIAR';
    difference: number;
  };
  klienci: {
    dziennie: number;
    możliwość_obsługi: number;
    procent_realizacji: number;
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

// Format minutes back to HH:MM time string
const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}:${mins.toString().padStart(2, '0')}`;
};

// Calculate the number of clients a coaster can serve in a day
const calculateDailyCapacity = (
  coaster: Coaster,
  wagons: Wagon[]
): number => {
  // Calculate the total operation time in minutes
  const startMinutes = timeStringToMinutes(coaster.godziny_od);
  const endMinutes = timeStringToMinutes(coaster.godziny_do);
  const operationMinutes = endMinutes - startMinutes;

  if (operationMinutes <= 0 || wagons.length === 0) {
    return 0;
  }

  // Calculate average speed and capacity across all wagons
  const totalSpeed = wagons.reduce((sum, wagon) => sum + wagon.predkosc_wagonu, 0);
  const avgSpeed = totalSpeed / wagons.length;  // in m/s

  const totalCapacity = wagons.reduce((sum, wagon) => sum + wagon.ilosc_miejsc, 0);

  // Calculate time for one round of the track
  const trackLength = coaster.dl_trasy; // in meters
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
  const startMinutes = timeStringToMinutes(coaster.godziny_od);
  const endMinutes = timeStringToMinutes(coaster.godziny_do);
  const operationMinutes = endMinutes - startMinutes;

  if (operationMinutes <= 0) {
    return 1;
  }

  // Calculate round trip time with rest
  const trackLength = coaster.dl_trasy; // in meters
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
  const requiredCapacityPerRound = coaster.liczba_klientow / roundsPerDay;

  // Calculate number of wagons needed
  const requiredWagons = Math.ceil(requiredCapacityPerRound / avgWagonCapacity);

  return Math.max(1, requiredWagons); // At least 1 wagon
};

// Calculate the max number of wagons that can safely complete their routes
const calculateMaxSafeWagons = (
  coaster: Coaster,
  avgWagonSpeed: number
): number => {
  const startMinutes = timeStringToMinutes(coaster.godziny_od);
  const endMinutes = timeStringToMinutes(coaster.godziny_do);
  const operationMinutes = endMinutes - startMinutes;

  // Calculate time for one trip
  const trackLength = coaster.dl_trasy; // in meters
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
  const maxSafeWagons = Math.floor(coaster.dl_trasy / safetyMinDistance);

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
  let avgWagonCapacity = 0;
  let avgWagonSpeed = 0;

  if (wagons.length > 0) {
    avgWagonCapacity = wagons.reduce((sum, wagon) => sum + wagon.ilosc_miejsc, 0) / wagons.length;
    avgWagonSpeed = wagons.reduce((sum, wagon) => sum + wagon.predkosc_wagonu, 0) / wagons.length;
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
  const currentPersonnel = coaster.liczba_personelu;
  const requiredPersonnel = calculateRequiredPersonnel(coaster, requiredWagons);

  // Determine if there's a personnel shortage or excess
  let personnelStatus: 'OK' | 'BRAK' | 'NADMIAR' = 'OK';
  let personnelDifference = currentPersonnel - requiredPersonnel;

  if (personnelDifference < 0) {
    personnelStatus = 'BRAK';
    personnelDifference = Math.abs(personnelDifference);
  } else if (personnelDifference > requiredPersonnel * 0.5) { // More than 50% excess
    personnelStatus = 'NADMIAR';
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
  } else if (dailyCapacity > coaster.liczba_klientow * 2) { // More than 2x capacity
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
    Math.min(Math.round((dailyCapacity / coaster.liczba_klientow) * 100), 100) : 0;

  return {
    id: coaster.id,
    godzinaOd: coaster.godziny_od,
    godzinaDo: coaster.godziny_do,
    liczbaWagonow: {
      current: wagons.length,
      required: requiredWagons,
      safe: maxSafeWagons
    },
    personel: {
      current: currentPersonnel,
      required: requiredPersonnel,
      status: personnelStatus,
      difference: personnelDifference
    },
    klienci: {
      dziennie: coaster.liczba_klientow,
      możliwość_obsługi: dailyCapacity,
      procent_realizacji: percentCapacity
    },
    status,
    details,
  };
};

// Get overall system status
const getSystemStatus = (): SystemStatus => {
  const coasters = getAllCoasters();
  const statuses = coasters.map(coaster => getCoasterStatus(coaster));

  const totalWagons = statuses.reduce((sum, status) => sum + status.liczbaWagonow.current, 0);
  const totalPersonnel = statuses.reduce((sum, status) => sum + status.personel.current, 0);
  const totalClients = statuses.reduce((sum, status) => sum + status.klienci.dziennie, 0);

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
    console.log(`System status: ${systemStatus.connectedNodes} connected nodes, ${systemStatus.isMasterNode ? 'MASTER NODE' : 'WORKER NODE'}`);
    console.log(`Total system capacity: ${statuses.length} coasters, ${systemStatus.totalWagons} wagons, ${systemStatus.totalPersonnel} personnel, ${systemStatus.totalClients} clients daily`);
    console.log("\n");

    if (statuses.length === 0) {
      console.log("No coasters registered in the system");
    }

    statuses.forEach(status => {
      console.log(`[Kolejka ${status.id}]`);
      console.log(`1. Godziny działania: ${status.godzinaOd} - ${status.godzinaDo}`);
      console.log(`2. Liczba wagonów: ${status.liczbaWagonow.current}/${status.liczbaWagonow.required} (max bezpiecznie: ${status.liczbaWagonow.safe})`);
      console.log(`3. Dostępny personel: ${status.personel.current}/${status.personel.required}`);
      console.log(`4. Klienci dziennie: ${status.klienci.dziennie} (obsługa: ${Math.round(status.klienci.procent_realizacji)}%)`);
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
