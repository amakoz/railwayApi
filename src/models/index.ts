import { v4 as uuidv4 } from 'uuid';

export interface Coaster {
  id: string;
  staffCount: number;
  clientCount: number;
  trackLength: number;
  hoursFrom: string;
  hoursTo: string;
}

export interface Wagon {
  id: string;
  coasterId: string;
  seatCount: number;
  wagonSpeed: number; // m/s
}

// Create a new coaster with default values
export const createCoaster = (
  staffCount: number,
  clientCount: number,
  trackLength: number,
  hoursFrom: string,
  hoursTo: string
): Coaster => {
  return {
    id: uuidv4(),
    staffCount,
    clientCount,
    trackLength,
    hoursFrom,
    hoursTo
  };
};

// Create a new wagon with default values
export const createWagon = (
  coasterId: string,
  seatCount: number,
  wagonSpeed: number
): Wagon => {
  return {
    id: uuidv4(),
    coasterId,
    seatCount,
    wagonSpeed
  };
};
