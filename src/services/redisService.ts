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

    // Subscribe to node events
    await subscribeToChanges('node_connected', handleNodeConnected);
    await subscribeToChanges('node_disconnected', handleNodeDisconnected);
    await subscribeToChanges('master_changed', handleMasterChanged);

    // Announce presence
    await publishChange('node_connected', nodeId);

    // Get list of all connected nodes
    const nodes = await redisClient.sMembers('connected_nodes');
    nodes.forEach(node => connectedNodes.add(node));

    logger.info(`Connected to ${connectedNodes.size} nodes in the distributed system`);
  } catch (error) {
    logger.error(`Error registering node: ${error}`);
  }
};

/**
 * Start sending heartbeats to check for master node availability
 */
const startHeartbeat = () => {
  setInterval(async () => {
    if (!isConnected) return;

    try {
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

        if (!isMasterConnected) {
          // Master is no longer connected, become master
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
