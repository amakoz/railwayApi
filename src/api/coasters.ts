import { Router } from 'express';
import {
  getAllCoasters,
  getCoasterById,
  addCoaster,
  updateCoaster,
  getWagonsByCoasterId,
  addWagon,
  removeWagon
} from '../services/dataService';
import { monitoringService } from '../services/monitoringService';
import { Coaster, createCoaster, createWagon } from '../models';
import { setupLogging } from '../utils/logger';

const router = Router();
const logger = setupLogging();

// GET all coasters
router.get('/', (req, res) => {
  try {
    const coasters = getAllCoasters();
    res.json({ success: true, data: coasters });
  } catch (error) {
    logger.error(`Error getting all coasters: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve coasters'
    });
  }
});

// GET a specific coaster by ID
router.get('/:coasterId', (req, res) => {
  try {
    const { coasterId } = req.params;
    const coaster = getCoasterById(coasterId);

    if (!coaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Get the status information for this coaster
    const status = monitoringService.getCoasterStatus(coaster);
    res.json({
      success: true,
      data: {
        ...coaster,
        status
      }
    });
  } catch (error) {
    logger.error(`Error getting coaster: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve coaster'
    });
  }
});

// POST create a new coaster
router.post('/', async (req, res) => {
  try {
    const {
      liczba_personelu,
      liczba_klientow,
      dl_trasy,
      godziny_od,
      godziny_do
    } = req.body;

    // Validate required fields
    if (!liczba_personelu || !liczba_klientow || !dl_trasy || !godziny_od || !godziny_do) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Create a new coaster
    const newCoaster = createCoaster(
      parseInt(liczba_personelu, 10),
      parseInt(liczba_klientow, 10),
      parseInt(dl_trasy, 10),
      godziny_od,
      godziny_do
    );

    // Add the coaster to storage
    await addCoaster(newCoaster);
    logger.info(`Created new coaster with ID: ${newCoaster.id}`);

    res.status(201).json({
      success: true,
      data: newCoaster
    });
  } catch (error) {
    logger.error(`Error creating coaster: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create coaster'
    });
  }
});

// PUT update an existing coaster
router.put('/:coasterId', async (req, res) => {
  try {
    const { coasterId } = req.params;
    const {
      liczba_personelu,
      liczba_klientow,
      godziny_od,
      godziny_do
    } = req.body;

    // Get existing coaster
    const existingCoaster = getCoasterById(coasterId);

    if (!existingCoaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Update the coaster (note: dl_trasy cannot be changed)
    const updates: Partial<Omit<Coaster, 'id' | 'dl_trasy'>> = {};

    if (liczba_personelu !== undefined) {
      updates.liczba_personelu = parseInt(liczba_personelu, 10);
    }

    if (liczba_klientow !== undefined) {
      updates.liczba_klientow = parseInt(liczba_klientow, 10);
    }

    if (godziny_od !== undefined) {
      updates.godziny_od = godziny_od;
    }

    if (godziny_do !== undefined) {
      updates.godziny_do = godziny_do;
    }

    // Perform the update
    const updatedCoaster = await updateCoaster(coasterId, updates);

    if (!updatedCoaster) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update coaster'
      });
    }

    logger.info(`Updated coaster with ID: ${coasterId}`);
    res.json({
      success: true,
      data: updatedCoaster
    });
  } catch (error) {
    logger.error(`Error updating coaster: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to update coaster'
    });
  }
});

// GET all wagons for a coaster
router.get('/:coasterId/wagons', (req, res) => {
  try {
    const { coasterId } = req.params;

    // Check if coaster exists
    const coaster = getCoasterById(coasterId);

    if (!coaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    const wagons = getWagonsByCoasterId(coasterId);
    res.json({
      success: true,
      data: wagons
    });
  } catch (error) {
    logger.error(`Error getting wagons: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve wagons'
    });
  }
});

// POST add a new wagon to a coaster
router.post('/:coasterId/wagons', async (req, res) => {
  try {
    const { coasterId } = req.params;
    const { ilosc_miejsc, predkosc_wagonu } = req.body;

    // Check if coaster exists
    const coaster = getCoasterById(coasterId);

    if (!coaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Validate required fields
    if (!ilosc_miejsc || !predkosc_wagonu) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Create a new wagon
    const newWagon = createWagon(
      coasterId,
      parseInt(ilosc_miejsc, 10),
      parseFloat(predkosc_wagonu)
    );

    // Add the wagon to storage
    await addWagon(newWagon);
    logger.info(`Added new wagon with ID: ${newWagon.id} to coaster: ${coasterId}`);

    res.status(201).json({
      success: true,
      data: newWagon
    });
  } catch (error) {
    logger.error(`Error adding wagon: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to add wagon'
    });
  }
});

// DELETE remove a wagon from a coaster
router.delete('/:coasterId/wagons/:wagonId', async (req, res) => {
  try {
    const { coasterId, wagonId } = req.params;

    // Check if coaster exists
    const coaster = getCoasterById(coasterId);

    if (!coaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Remove the wagon
    const success = await removeWagon(coasterId, wagonId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Wagon not found'
      });
    }

    logger.info(`Removed wagon with ID: ${wagonId} from coaster: ${coasterId}`);

    res.json({
      success: true,
      message: 'Wagon removed successfully'
    });
  } catch (error) {
    logger.error(`Error removing wagon: ${error}`);
    res.status(500).json({
      success: false,
      error: 'Failed to remove wagon'
    });
  }
});

export default router;
