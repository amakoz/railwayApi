import { v4 as uuidv4 } from 'uuid';

export interface Coaster {
  id: string;
  liczba_personelu: number;
  liczba_klientow: number;
  dl_trasy: number;
  godziny_od: string;
  godziny_do: string;
}

export interface Wagon {
  id: string;
  coasterId: string;
  ilosc_miejsc: number;
  predkosc_wagonu: number; // m/s
}

// Create a new coaster with default values
export const createCoaster = (
  liczba_personelu: number,
  liczba_klientow: number,
  dl_trasy: number,
  godziny_od: string,
  godziny_do: string
): Coaster => {
  return {
    id: uuidv4(),
    liczba_personelu,
    liczba_klientow,
    dl_trasy,
    godziny_od,
    godziny_do
  };
};

// Create a new wagon with default values
export const createWagon = (
  coasterId: string,
  ilosc_miejsc: number,
  predkosc_wagonu: number
): Wagon => {
  return {
    id: uuidv4(),
    coasterId,
    ilosc_miejsc,
    predkosc_wagonu
  };
};
