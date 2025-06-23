import fs from 'fs';
import path from 'path';
import { Coaster, Wagon } from '../models';
import { config } from '../config';
import { setupLogging } from '../utils/logger';
import { publishChange, subscribeToChanges } from './redisService';

const logger = setupLogging();

// Ensure data directories exist
const createDataDirectories = () => {
  const devDir = path.dirname(config.dataPath.coasters);
  const prodDir = path.dirname(config.dataPath.wagons);

  if (!fs.existsSync(devDir)) {
    fs.mkdirSync(devDir, { recursive: true });
  }

  if (!fs.existsSync(prodDir)) {
    fs.mkdirSync(prodDir, { recursive: true });
  }
};

// Initialize data files if they don't exist
const initDataFiles = () => {
  createDataDirectories();

  // Check and initialize coasters file
  if (!fs.existsSync(config.dataPath.coasters)) {
    fs.writeFileSync(config.dataPath.coasters, JSON.stringify([]));
    logger.info(`Created coasters data file at ${config.dataPath.coasters}`);
  }

  // Check and initialize wagons file
  if (!fs.existsSync(config.dataPath.wagons)) {
    fs.writeFileSync(config.dataPath.wagons, JSON.stringify([]));
    logger.info(`Created wagons data file at ${config.dataPath.wagons}`);
  }
};

// Initialize the data system
export const initDataService = () => {
  initDataFiles();

  // Subscribe to data change events for distributed system
  subscribeToChanges('coaster_updated', (message) => {
    const coaster = JSON.parse(message);
    updateCoasterLocal(coaster);
    logger.info(`Received coaster update from another node: ${coaster.id}`);
  });

  subscribeToChanges('wagon_added', (message) => {
    const wagon = JSON.parse(message);
    addWagonLocal(wagon);
    logger.info(`Received new wagon from another node: ${wagon.id}`);
  });

  subscribeToChanges('wagon_removed', (message) => {
    const { coasterId, wagonId } = JSON.parse(message);
    removeWagonLocal(coasterId, wagonId);
    logger.info(`Received wagon removal notification from another node: ${wagonId}`);
  });

  logger.info('Data service initialized');
};

// COASTER OPERATIONS

// Get all coasters
export const getAllCoasters = (): Coaster[] => {
  try {
    const data = fs.readFileSync(config.dataPath.coasters, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error getting all coasters: ${error}`);
    return [];
  }
};

// Get a single coaster by ID
export const getCoasterById = (id: string): Coaster | null => {
  try {
    const coasters = getAllCoasters();
    const coaster = coasters.find(c => c.id === id);
    return coaster || null;
  } catch (error) {
    logger.error(`Error getting coaster by ID: ${error}`);
    return null;
  }
};

// Add a new coaster
export const addCoaster = async (coaster: Coaster): Promise<Coaster> => {
  try {
    // Add locally first
    const result = addCoasterLocal(coaster);

    // Then sync with other nodes
    await publishChange('coaster_added', JSON.stringify(coaster));

    return result;
  } catch (error) {
    logger.error(`Error adding coaster: ${error}`);
    throw error;
  }
};

// Local coaster addition (without syncing)
const addCoasterLocal = (coaster: Coaster): Coaster => {
  try {
    const coasters = getAllCoasters();
    coasters.push(coaster);
    fs.writeFileSync(config.dataPath.coasters, JSON.stringify(coasters, null, 2));
    logger.info(`Coaster added: ${coaster.id}`);
    return coaster;
  } catch (error) {
    logger.error(`Error adding coaster locally: ${error}`);
    throw error;
  }
};

// Update a coaster
export const updateCoaster = async (id: string, updates: Partial<Omit<Coaster, 'id'>>): Promise<Coaster | null> => {
  try {
    // Update locally first
    const result = updateCoasterLocal({ id, ...updates } as Coaster);

    // Then sync with other nodes
    if (result) {
      await publishChange('coaster_updated', JSON.stringify(result));
    }

    return result;
  } catch (error) {
    logger.error(`Error updating coaster: ${error}`);
    return null;
  }
};

// Local coaster update (without syncing)
const updateCoasterLocal = (updates: Partial<Coaster> & { id: string }): Coaster | null => {
  try {
    const coasters = getAllCoasters();
    const index = coasters.findIndex(c => c.id === updates.id);

    if (index === -1) {
      logger.warn(`Coaster not found for update: ${updates.id}`);
      return null;
    }

    // Only update the provided fields
    const updatedCoaster = {
      ...coasters[index],
      ...updates
    };

    // Keep the length of the track constant
    updatedCoaster.dl_trasy = coasters[index].dl_trasy;

    coasters[index] = updatedCoaster;
    fs.writeFileSync(config.dataPath.coasters, JSON.stringify(coasters, null, 2));
    logger.info(`Coaster updated: ${updates.id}`);

    return updatedCoaster;
  } catch (error) {
    logger.error(`Error updating coaster locally: ${error}`);
    return null;
  }
};

// WAGON OPERATIONS

// Get all wagons
export const getAllWagons = (): Wagon[] => {
  try {
    const data = fs.readFileSync(config.dataPath.wagons, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error getting all wagons: ${error}`);
    return [];
  }
};

// Get wagons for a specific coaster
export const getWagonsByCoasterId = (coasterId: string): Wagon[] => {
  try {
    const wagons = getAllWagons();
    return wagons.filter(w => w.coasterId === coasterId);
  } catch (error) {
    logger.error(`Error getting wagons for coaster: ${error}`);
    return [];
  }
};

// Add a new wagon
export const addWagon = async (wagon: Wagon): Promise<Wagon> => {
  try {
    // Add locally first
    const result = addWagonLocal(wagon);

    // Then sync with other nodes
    await publishChange('wagon_added', JSON.stringify(wagon));

    return result;
  } catch (error) {
    logger.error(`Error adding wagon: ${error}`);
    throw error;
  }
};

// Local wagon addition (without syncing)
const addWagonLocal = (wagon: Wagon): Wagon => {
  try {
    const wagons = getAllWagons();
    wagons.push(wagon);
    fs.writeFileSync(config.dataPath.wagons, JSON.stringify(wagons, null, 2));
    logger.info(`Wagon added: ${wagon.id} to coaster: ${wagon.coasterId}`);
    return wagon;
  } catch (error) {
    logger.error(`Error adding wagon locally: ${error}`);
    throw error;
  }
};

// Remove a wagon
export const removeWagon = async (coasterId: string, wagonId: string): Promise<boolean> => {
  try {
    // Remove locally first
    const result = removeWagonLocal(coasterId, wagonId);

    // Then sync with other nodes
    if (result) {
      await publishChange('wagon_removed', JSON.stringify({ coasterId, wagonId }));
    }

    return result;
  } catch (error) {
    logger.error(`Error removing wagon: ${error}`);
    return false;
  }
};

// Local wagon removal (without syncing)
const removeWagonLocal = (coasterId: string, wagonId: string): boolean => {
  try {
    const wagons = getAllWagons();
    const initialLength = wagons.length;
    const filteredWagons = wagons.filter(w => !(w.coasterId === coasterId && w.id === wagonId));

    if (filteredWagons.length === initialLength) {
      logger.warn(`Wagon not found for removal: ${wagonId} from coaster: ${coasterId}`);
      return false;
    }

    fs.writeFileSync(config.dataPath.wagons, JSON.stringify(filteredWagons, null, 2));
    logger.info(`Wagon removed: ${wagonId} from coaster: ${coasterId}`);

    return true;
  } catch (error) {
    logger.error(`Error removing wagon locally: ${error}`);
    return false;
  }
};
