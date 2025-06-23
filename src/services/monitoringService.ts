import { setupLogging } from '../utils/logger';
import { getAllCoasters, getWagonsByCoasterId } from './dataService';
import { Coaster, Wagon } from '../models';

const logger = setupLogging();

// Constants for calculations
const WAGON_PERSONNEL_REQUIRED = 2; // 2 personnel per wagon
const COASTER_BASE_PERSONNEL = 1;   // 1 base personnel per coaster
const WAGON_REST_TIME = 5;          // 5 minutes rest time for each wagon

interface CoasterStatus {
  id: string;
  godzinaOd: string;
  godzinaDo: string;
  liczbaWagonow: {
    current: number;
    required: number;
  };
  personel: {
    current: number;
    required: number;
  };
  klienciDziennie: number;
  status: string;
  details: string;
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
  const startMinutes = timeStringToMinutes(coaster.godziny_od);
  const endMinutes = timeStringToMinutes(coaster.godziny_do);
  const operationMinutes = endMinutes - startMinutes;

  if (operationMinutes <= 0) {
    return 0;
  }

  if (wagons.length === 0) {
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

  // Calculate how many rounds each wagon can make
  const roundsPerWagon = operationMinutes / totalRoundTime;

  // Calculate total daily capacity
  const dailyCapacity = totalCapacity * roundsPerWagon;

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

  // Calculate rounds per day
  const roundsPerDay = operationMinutes / roundTripTime;

  // Calculate required capacity per round
  const requiredCapacityPerRound = coaster.liczba_klientow / roundsPerDay;

  // Calculate number of wagons needed
  const requiredWagons = Math.ceil(requiredCapacityPerRound / avgWagonCapacity);

  return Math.max(1, requiredWagons); // At least 1 wagon
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
  }

  // Calculate actual daily capacity with current wagons
  const dailyCapacity = calculateDailyCapacity(coaster, wagons);

  // Calculate required wagons to meet the client demand
  const requiredWagons = calculateRequiredWagons(
    coaster,
    avgWagonCapacity || 30, // Default capacity if no wagons
    avgWagonSpeed || 1.0    // Default speed if no wagons
  );

  // Calculate current and required personnel
  const currentPersonnel = coaster.liczba_personelu;
  const requiredPersonnel = calculateRequiredPersonnel(coaster, requiredWagons);

  // Determine status and details
  let status = "OK";
  let details = "";

  // Check for personnel issues
  if (currentPersonnel < requiredPersonnel) {
    status = "Problem";
    details += `Brakuje ${requiredPersonnel - currentPersonnel} pracowników. `;
  } else if (currentPersonnel > requiredPersonnel * 1.5) { // 50% more than needed
    status = "Problem";
    details += `Nadmiar ${currentPersonnel - requiredPersonnel} pracowników. `;
  }

  // Check for wagon issues
  if (wagons.length < requiredWagons) {
    status = "Problem";
    details += `Brak ${requiredWagons - wagons.length} wagonów. `;
  } else if (dailyCapacity > coaster.liczba_klientow * 2) { // More than 2x capacity
    status = "Problem";
    details += `Nadmiar ${wagons.length - requiredWagons} wagonów. `;
  }

  // If empty, set OK status
  if (details === "") {
    details = "Wszystko działa poprawnie.";
  }

  return {
    id: coaster.id,
    godzinaOd: coaster.godziny_od,
    godzinaDo: coaster.godziny_do,
    liczbaWagonow: {
      current: wagons.length,
      required: requiredWagons,
    },
    personel: {
      current: currentPersonnel,
      required: requiredPersonnel,
    },
    klienciDziennie: coaster.liczba_klientow,
    status,
    details,
  };
};

// Start monitoring and display stats
const startMonitoring = () => {
  const displayStats = () => {
    const statuses = getCoasterStatuses();
    console.log("\n");
    console.log(`[Godzina ${new Date().getHours()}:${String(new Date().getMinutes()).padStart(2, '0')}]`);

    statuses.forEach(status => {
      console.log(`[Kolejka ${status.id}]`);
      console.log(`1. Godziny działania: ${status.godzinaOd} - ${status.godzinaDo}`);
      console.log(`2. Liczba wagonów: ${status.liczbaWagonow.current}/${status.liczbaWagonow.required}`);
      console.log(`3. Dostępny personel: ${status.personel.current}/${status.personel.required}`);
      console.log(`4. Klienci dziennie: ${status.klienciDziennie}`);
      console.log(`5. Status: ${status.status}`);

      if (status.status !== "OK") {
        console.log(`6. Problem: ${status.details}`);
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
  startMonitoring,
};
