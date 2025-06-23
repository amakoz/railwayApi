import { createClient } from 'redis';
import { config } from '../config';
import { setupLogging } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = setupLogging();
const redisClient = createClient({
  url: `redis://${config.redis.host}:${config.redis.port}`
});

// Keep track of node connectivity for distributed system management
let isConnected = false;
let isMasterNode = false;
let connectedNodes = new Set<string>();
const nodeId = uuidv4(); // Unique identifier for this node
let lastSyncTimestamp = Date.now();

/**
 * Initialize the Redis connection
 */
export const initializeRedis = async () => {
  try {
    redisClient.on('error', (err) => {
      logger.error(`Redis error: ${err}`);
      isConnected = false;
      isMasterNode = false;
    });

    redisClient.on('connect', () => {
      isConnected = true;
      registerNode();
      startHeartbeat();
      startDataSyncProcess();
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error(`Failed to connect to Redis: ${error}`);
    // Even if Redis fails, the system should work in standalone mode
    return null;
  }
};

/**
 * Register this node with the distributed system
 */
const registerNode = async () => {
  if (!isConnected) return;

  try {
    // Try to get the master node
    const masterNode = await redisClient.get('master_node');

    if (!masterNode) {
      // No master node exists, become the master
      await redisClient.set('master_node', nodeId);
      isMasterNode = true;
      logger.info(`This node (${nodeId}) is now the master node`);
    } else {
      // Master exists, register as a worker
      isMasterNode = false;
      logger.info(`This node (${nodeId}) is a worker node, master is ${masterNode}`);
    }

    // Add this node to the connected nodes list
    await redisClient.sAdd('connected_nodes', nodeId);

    // Set node last active timestamp
    await redisClient.hSet('node_timestamps', nodeId, Date.now().toString());

    // Subscribe to node events
    await subscribeToChanges('node_connected', handleNodeConnected);
    await subscribeToChanges('node_disconnected', handleNodeDisconnected);
    await subscribeToChanges('master_changed', handleMasterChanged);
    await subscribeToChanges('data_changed', handleDataChange);

    // Announce presence
    await publishChange('node_connected', nodeId);

    // Get list of all connected nodes
    const nodes = await redisClient.sMembers('connected_nodes');
    nodes.forEach(node => connectedNodes.add(node));

    logger.info(`Connected to ${connectedNodes.size} nodes in the distributed system`);

    // Request data sync if we're a new node
    if (!isMasterNode) {
      requestInitialSync();
    }
  } catch (error) {
    logger.error(`Error registering node: ${error}`);
  }
};

/**
 * Request initial data synchronization from the master node
 */
const requestInitialSync = async () => {
  try {
    await publishChange('sync_request', JSON.stringify({
      nodeId,
      timestamp: Date.now()
    }));
    logger.info('Requested initial data sync from master node');
  } catch (error) {
    logger.error(`Error requesting initial sync: ${error}`);
  }
};

/**
 * Start the data synchronization process
 */
const startDataSyncProcess = () => {
  // Subscribe to sync requests
  subscribeToChanges('sync_request', async (message) => {
    if (!isMasterNode) return; // Only master responds to sync requests

    try {
      const request = JSON.parse(message);
      logger.info(`Received sync request from node ${request.nodeId}`);

      // Send synchronization data to the requesting node
      // This would typically include the latest state of all entities
      // For demonstration purposes, we're just sending an acknowledgment
      await publishChange('sync_response', JSON.stringify({
        targetNodeId: request.nodeId,
        sourceNodeId: nodeId,
        timestamp: Date.now(),
        // Here we would include full data dump
      }));

    } catch (error) {
      logger.error(`Error processing sync request: ${error}`);
    }
  });

  // Subscribe to sync responses (for receiving initial data)
  subscribeToChanges('sync_response', async (message) => {
    try {
      const response = JSON.parse(message);

      // Only process responses targeted to this node
      if (response.targetNodeId === nodeId) {
        logger.info(`Received sync response from master node ${response.sourceNodeId}`);
        // Here we would process the full data and update our local state
        lastSyncTimestamp = response.timestamp;
      }
    } catch (error) {
      logger.error(`Error processing sync response: ${error}`);
    }
  });
};

/**
 * Start sending heartbeats to check for master node availability
 */
const startHeartbeat = () => {
  setInterval(async () => {
    if (!isConnected) return;

    try {
      // Update node timestamp
      await redisClient.hSet('node_timestamps', nodeId, Date.now().toString());

      // Check if master node is still active
      const masterNode = await redisClient.get('master_node');

      if (!masterNode) {
        // No master, try to become master
        await redisClient.set('master_node', nodeId);
        if (!isMasterNode) {
          isMasterNode = true;
          logger.info(`This node (${nodeId}) is now the master node`);
          await publishChange('master_changed', nodeId);
        }
      } else if (masterNode !== nodeId) {
        // Check if master is still connected
        const isMasterConnected = await redisClient.sIsMember('connected_nodes', masterNode);
        const masterTimestamp = await redisClient.hGet('node_timestamps', masterNode);
        const masterLastActive = masterTimestamp ? parseInt(masterTimestamp, 10) : 0;
        const masterTimeout = Date.now() - 10000; // 10 seconds timeout

        if (!isMasterConnected || masterLastActive < masterTimeout) {
          // Master is no longer connected or has timed out, become master
          await redisClient.set('master_node', nodeId);
          isMasterNode = true;
          logger.info(`Previous master ${masterNode} disconnected. This node (${nodeId}) is now the master node`);
          await publishChange('master_changed', nodeId);
        }
      }

      // Refresh this node's presence
      await redisClient.sAdd('connected_nodes', nodeId);

    } catch (error) {
      logger.error(`Error in heartbeat: ${error}`);
    }
  }, 5000); // Check every 5 seconds
};

// Node event handlers
const handleNodeConnected = (nodeIdStr: string) => {
  if (nodeIdStr !== nodeId) {
    connectedNodes.add(nodeIdStr);
    logger.info(`Node ${nodeIdStr} connected to the system. Total nodes: ${connectedNodes.size}`);
  }
};

const handleNodeDisconnected = (nodeIdStr: string) => {
  connectedNodes.delete(nodeIdStr);
  logger.info(`Node ${nodeIdStr} disconnected from the system. Total nodes: ${connectedNodes.size}`);
};

const handleMasterChanged = (newMasterNodeId: string) => {
  if (newMasterNodeId !== nodeId) {
    isMasterNode = false;
    logger.info(`Master node changed to ${newMasterNodeId}`);
  }
};

// Handle data change notifications from other nodes
const handleDataChange = (message: string) => {
  try {
    const change = JSON.parse(message);

    // Skip if this is our own change
    if (change.sourceNodeId === nodeId) return;

    // Skip if the change is older than our last sync
    if (change.timestamp < lastSyncTimestamp) return;

    logger.info(`Received data change from node ${change.sourceNodeId}: ${change.type} on ${change.entityType} ${change.entityId}`);

    // Process the change based on its type
    // This would typically call appropriate methods in your data service
    // to update local data files without triggering further sync messages

  } catch (error) {
    logger.error(`Error handling data change: ${error}`);
  }
};

/**
 * Publish a change to the distributed system
 */
export const publishChange = async (channel: string, message: string) => {
  if (!isConnected) return;

  try {
    await redisClient.publish(channel, message);
  } catch (error) {
    logger.error(`Error publishing to channel ${channel}: ${error}`);
  }
};

/**
 * Publish a data change that needs to be synchronized
 */
export const publishDataChange = async (type: 'create' | 'update' | 'delete', entityType: string, entityId: string, data?: any) => {
  if (!isConnected) return;

  try {
    const changeMessage = JSON.stringify({
      sourceNodeId: nodeId,
      timestamp: Date.now(),
      type,
      entityType,
      entityId,
      data
    });

    await redisClient.publish('data_changed', changeMessage);
  } catch (error) {
    logger.error(`Error publishing data change: ${error}`);
  }
};

/**
 * Subscribe to changes from the distributed system
 */
export const subscribeToChanges = async (channel: string, callback: (message: string) => void) => {
  if (!isConnected) return;

  try {
    const subscriber = redisClient.duplicate();
    await subscriber.connect();

    await subscriber.subscribe(channel, (message) => {
      callback(message);
    });

    logger.info(`Subscribed to channel: ${channel}`);
  } catch (error) {
    logger.error(`Error subscribing to channel ${channel}: ${error}`);
  }
};

/**
 * Check if this node is the master node
 */
export const isMaster = () => isMasterNode;

/**
 * Get the number of connected nodes
 */
export const getConnectedNodesCount = () => connectedNodes.size;

/**
 * Clean up Redis connections before shutting down
 */
export const cleanupRedis = async () => {
  if (isConnected) {
    try {
      // Announce disconnection
      await publishChange('node_disconnected', nodeId);
      await redisClient.sRem('connected_nodes', nodeId);
      await redisClient.hDel('node_timestamps', nodeId);

      // If this is the master, clear the master reference
      if (isMasterNode) {
        const currentMaster = await redisClient.get('master_node');
        if (currentMaster === nodeId) {
          await redisClient.del('master_node');
        }
      }

      // Close connections
      await redisClient.quit();
      logger.info('Redis connections closed gracefully');
    } catch (error) {
      logger.error(`Error cleaning up Redis: ${error}`);
    }
  }
};
