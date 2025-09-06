import mongoose from 'mongoose';
import { config } from './configuration';

// Connection options for MongoDB Atlas
const mongoOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  retryWrites: true,
  w: 'majority' as const,
};

// Single main database connection
let mainDBConnection: mongoose.Connection | null = null;
let metricsDBConnection: mongoose.Connection | null = null;

const connectWithRetry = async (url: string, name: string, retries = 3): Promise<mongoose.Connection> => {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`🔌 Attempting to connect to ${name} (attempt ${i + 1}/${retries})...`);
      
      let connection: mongoose.Connection;
      
      if (name === 'Main Database') {
        if (mainDBConnection && mainDBConnection.readyState === 1) {
          console.log(`✅ ${name} already connected`);
          return mainDBConnection;
        }
        await mongoose.connect(url, mongoOptions);
        connection = mongoose.connection;
        mainDBConnection = connection;
      } else {
        if (metricsDBConnection && metricsDBConnection.readyState === 1) {
          console.log(`✅ ${name} already connected`);
          return metricsDBConnection;
        }
        connection = mongoose.createConnection(url, mongoOptions);
        await new Promise((resolve, reject) => {
          connection.on('connected', resolve);
          connection.on('error', reject);
          setTimeout(() => reject(new Error('Connection timeout')), 10000);
        });
        metricsDBConnection = connection;
      }
      
      console.log(`✅ Connected to ${name} 🚀`);
      
      // Enhanced connection event handling
      connection.on('error', (err) => {
        console.error(`❌ ${name} connection error:`, err);
      });

      connection.on('disconnected', () => {
        console.warn(`⚠️ ${name} disconnected - attempting reconnection...`);
      });

      connection.on('reconnected', () => {
        console.log(`🔄 ${name} reconnected successfully`);
      });

      return connection;
    } catch (error: any) {
      console.error(`❌ ${name} connection attempt ${i + 1} failed:`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const delay = Math.pow(2, i) * 1000;
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error(`Failed to connect to ${name} after ${retries} attempts`);
};

export const connectMainDB = async (): Promise<mongoose.Connection> => {
  if (!config.MAIN_DB_URI) {
    throw new Error('MONGODB_MAIN_URL is not defined');
  }

  return await connectWithRetry(config.MAIN_DB_URI, 'Main Database');
};

export const connectMetricsDB = async (): Promise<mongoose.Connection> => {
  if (!config.METRICS_DB_URI) {
    throw new Error('MONGODB_METRICS_URL is not defined');
  }

  return await connectWithRetry(config.METRICS_DB_URI, 'Metrics Database');
};

export const getMainDBConnection = (): mongoose.Connection | null => {
  return mainDBConnection;
};

export const getMetricsDBConnection = (): mongoose.Connection | null => {
  return metricsDBConnection;
};

export const initializeDatabases = async () => {
  try {
    console.log('🔄 Starting database initialization...');
    
    // Connect to main database
    await connectMainDB();
    
    // Connect to metrics database
    await connectMetricsDB();
    
    console.log('✅ All databases initialized successfully');
    
    return true;
  } catch (error) {
    console.error('🚨 Failed to initialize databases:', error);
    throw error;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connections...');
  
  if (mainDBConnection) {
    await mainDBConnection.close();
    console.log('✅ Main database connection closed');
  }
  
  if (metricsDBConnection) {
    await metricsDBConnection.close();
    console.log('✅ Metrics database connection closed');
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, closing database connections...');
  
  if (mainDBConnection) {
    await mainDBConnection.close();
  }
  
  if (metricsDBConnection) {
    await metricsDBConnection.close();
  }
  
  process.exit(0);
});

export default {
  connectMainDB,
  connectMetricsDB,
  getMainDBConnection,
  getMetricsDBConnection,
  initializeDatabases
};
