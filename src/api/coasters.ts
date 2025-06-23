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
      staffCount,
      clientCount,
      trackLength,
      hoursFrom,
      hoursTo
    } = req.body;

    // Validate required fields
    if (!staffCount || !clientCount || !trackLength || !hoursFrom || !hoursTo) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Create a new coaster
    const newCoaster = createCoaster(
      parseInt(staffCount, 10),
      parseInt(clientCount, 10),
      parseInt(trackLength, 10),
      hoursFrom,
      hoursTo
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
      staffCount,
      clientCount,
      hoursFrom,
      hoursTo
    } = req.body;

    // Get existing coaster
    const existingCoaster = getCoasterById(coasterId);

    if (!existingCoaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Update the coaster (note: trackLength cannot be changed)
    const updates: Partial<Omit<Coaster, 'id' | 'trackLength'>> = {};

    if (staffCount !== undefined) {
      updates.staffCount = parseInt(staffCount, 10);
    }

    if (clientCount !== undefined) {
      updates.clientCount = parseInt(clientCount, 10);
    }

    if (hoursFrom !== undefined) {
      updates.hoursFrom = hoursFrom;
    }

    if (hoursTo !== undefined) {
      updates.hoursTo = hoursTo;
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
    const { seatCount, wagonSpeed } = req.body;

    // Check if coaster exists
    const coaster = getCoasterById(coasterId);

    if (!coaster) {
      return res.status(404).json({
        success: false,
        error: 'Coaster not found'
      });
    }

    // Validate required fields
    if (!seatCount || !wagonSpeed) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // Create a new wagon
    const newWagon = createWagon(
      coasterId,
      parseInt(seatCount, 10),
      parseFloat(wagonSpeed)
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
