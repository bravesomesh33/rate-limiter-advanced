
# Rate Limiter Package

This package provides middleware for rate limiting in a Node.js application using Redis. It includes two types of rate limiting: one using the `rate-limiter-flexible` library and a custom implementation.

## Installation

To install the package, you need to have Node.js and npm installed. Then run the following command:

```sh
npm install rate-limiter-advanced
```

## Usage

### Importing the Middleware

Import the middleware functions in your Express.js application:

```javascript
import { rateLimiterUsingThirdParty, customRedisRateLimiter } from 'rate-limiter-advanced';
```

### Middleware Functions

#### Rate Limiter Using `rate-limiter-flexible`

This middleware uses the `rate-limiter-flexible` library to limit the number of requests a user can make within a specified time window.

```javascript
export const rateLimiterUsingThirdParty = async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    return next();
  } catch (error) {
    return res.status(429).jsend.error(`You have exceeded the ${MAX_WINDOW_REQUEST_COUNT} requests in ${WINDOW_SIZE_IN_HOURS} hrs limit!`);
  }
};
```

#### Custom Redis Rate Limiter

This middleware implements custom rate limiting logic using Redis to store request logs.

```javascript
export const customRedisRateLimiter = async (req, res, next) => {
  try {
    const currentRequestTime = moment();
    const record = await getAsync(req.ip);

    if (record == null) {
      const newRecord = [{
        requestTimeStamp: currentRequestTime.unix(),
        requestCount: 1,
      }];
      await setAsync(req.ip, JSON.stringify(newRecord));
      return next();
    }

    const data = JSON.parse(record);
    const windowStartTimestamp = moment().subtract(WINDOW_SIZE_IN_HOURS, 'hours').unix();
    const requestsWithinWindow = data.filter(entry => entry.requestTimeStamp > windowStartTimestamp);
    const totalWindowRequestsCount = requestsWithinWindow.reduce((accumulator, entry) => accumulator + entry.requestCount, 0);

    if (totalWindowRequestsCount >= MAX_WINDOW_REQUEST_COUNT) {
      return res.status(429).jsend.error(`You have exceeded the ${MAX_WINDOW_REQUEST_COUNT} requests in ${WINDOW_SIZE_IN_HOURS} hrs limit!`);
    }

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
```

### Applying the Middleware

To use these middleware functions in your Express.js application, apply them to your routes:

```javascript
import express from 'express';
import { rateLimiterUsingThirdParty, customRedisRateLimiter } from './rateLimiter.js';

const app = express();

app.use('/api', rateLimiterUsingThirdParty);
app.use('/custom-api', customRedisRateLimiter);

app.get('/api', (req, res) => {
  res.send('Rate limited API');
});

app.get('/custom-api', (req, res) => {
  res.send('Custom rate limited API');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
```

## Configuration

The rate limiting configuration is defined by the following constants in the `rateLimiter.js` file:

- `WINDOW_SIZE_IN_HOURS`: The time window size in hours.
- `MAX_WINDOW_REQUEST_COUNT`: The maximum number of requests allowed within the time window.
- `WINDOW_LOG_INTERVAL_IN_HOURS`: The interval in hours for logging request timestamps.

## Dependencies

- `rate-limiter-flexible`: Flexible and efficient rate limiter for Node.js.
- `moment`: A library for parsing, validating, manipulating, and formatting dates.
- `redis`: A Redis client for Node.js.
- `jsend`: A library for JSend-compliant response formatting.
- `util`: Node.js utility module for promisifying functions.

## License

This package is licensed under the ISC License.
