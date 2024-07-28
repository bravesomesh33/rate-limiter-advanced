import { RateLimiterRedis } from 'rate-limiter-flexible';
import moment from 'moment';
import redis from 'redis';
import { promisify } from 'util';
import jsend from 'jsend';

// Create Redis client and promisify get and set functions
const redisClient = redis.createClient();
const getAsync = promisify(redisClient.get).bind(redisClient);
const setAsync = promisify(redisClient.set).bind(redisClient);

// Constants for rate limiting
const WINDOW_SIZE_IN_HOURS = 24;
const MAX_WINDOW_REQUEST_COUNT = 110;
const WINDOW_LOG_INTERVAL_IN_HOURS = 1;

// Options for rate-limiter-flexible
const opts = {
  storeClient: redisClient,
  keyPrefix: 'rateLimiter',
  points: MAX_WINDOW_REQUEST_COUNT,
  duration: WINDOW_SIZE_IN_HOURS * 60 * 60,
  blockDuration: WINDOW_SIZE_IN_HOURS * 60 * 60,
};

// Create rate limiter instance
const rateLimiter = new RateLimiterRedis(opts);

// Rate limiter middleware using rate-limiter-flexible
export const rateLimiterUsingThirdParty = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    return next();
  } catch (error) {
    return res.status(429).jsend.error(`You have exceeded the ${MAX_WINDOW_REQUEST_COUNT} requests in ${WINDOW_SIZE_IN_HOURS} hrs limit!`);
  }
};

// Custom rate limiter middleware
export const customRedisRateLimiter = async (req, res, next) => {
  try {
    const currentRequestTime = moment();
    // Fetch records of the current user using IP address
    const record = await getAsync(req.ip);

    // If no record is found, create a new record for the user and store it in Redis
    if (record == null) {
      const newRecord = [{
        requestTimeStamp: currentRequestTime.unix(),
        requestCount: 1,
      }];
      await setAsync(req.ip, JSON.stringify(newRecord));
      return next();
    }

    // Parse the record and calculate the number of requests within the last window
    const data = JSON.parse(record);
    const windowStartTimestamp = moment().subtract(WINDOW_SIZE_IN_HOURS, 'hours').unix();
    const requestsWithinWindow = data.filter(entry => entry.requestTimeStamp > windowStartTimestamp);
    const totalWindowRequestsCount = requestsWithinWindow.reduce((accumulator, entry) => accumulator + entry.requestCount, 0);

    // If the number of requests made is greater than or equal to the maximum, return an error
    if (totalWindowRequestsCount >= MAX_WINDOW_REQUEST_COUNT) {
      return res.status(429).jsend.error(`You have exceeded the ${MAX_WINDOW_REQUEST_COUNT} requests in ${WINDOW_SIZE_IN_HOURS} hrs limit!`);
    }

    // Log a new entry or increment the counter if the interval has not passed
    const lastRequestLog = data[data.length - 1];
    const potentialCurrentWindowIntervalStartTimeStamp = currentRequestTime.subtract(WINDOW_LOG_INTERVAL_IN_HOURS, 'hours').unix();

    if (lastRequestLog.requestTimeStamp > potentialCurrentWindowIntervalStartTimeStamp) {
      lastRequestLog.requestCount++;
      data[data.length - 1] = lastRequestLog;
    } else {
      data.push({
        requestTimeStamp: currentRequestTime.unix(),
        requestCount: 1,
      });
    }

    await setAsync(req.ip, JSON.stringify(data));
    return next();
  } catch (error) {
    return next(error);
  }
};
