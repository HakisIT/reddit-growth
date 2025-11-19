import axios from 'axios';
import { log, error, warn } from '../utils/logger.js';

/**
 * Pool of modern Chrome User-Agent strings
 */
const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
];

/**
 * Gets a random User-Agent from the pool
 * @returns {string}
 */
function getRandomUserAgent() {
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

/**
 * Generates full browser headers for a request
 * @param {string} userAgent - User-Agent string
 * @returns {Object} - Headers object
 */
function getBrowserHeaders(userAgent) {
  return {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'max-age=0',
    'Pragma': 'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Chromium";v="125", "Google Chrome";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'Referer': 'https://www.reddit.com/',
    'Connection': 'keep-alive',
    'DNT': '1'
  };
}

/**
 * Detects if Reddit has blocked the request
 * @param {string} html - HTML content to check
 * @returns {boolean}
 */
function isBlocked(html) {
  if (!html || html.length === 0) {
    return true;
  }
  
  const lowerHtml = html.toLowerCase();
  
  // Check for blocked indicators
  if (lowerHtml.includes('blocked') || 
      lowerHtml.includes('access denied') ||
      lowerHtml.includes('varnish') ||
      (lowerHtml.includes('cloudflare') && lowerHtml.includes('checking'))) {
    return true;
  }
  
  // Check for empty body
  if (html.includes('<body></body>') || html.includes('<body> </body>')) {
    return true;
  }
  
  // Check for generic Reddit title without content
  if (html.includes('<title>reddit.com</title>') && html.length < 5000) {
    return true;
  }
  
  return false;
}

/**
 * Sleeps for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Parses proxy URL and returns axios proxy config
 * @returns {Object|null} - Axios proxy config or null
 */
function getProxyConfig() {
  const proxyUrl = process.env.REDDIT_PROXY;
  
  if (!proxyUrl || proxyUrl.trim() === '') {
    return null;
  }
  
  try {
    // Parse proxy URL (supports http://user:pass@host:port format)
    const url = new URL(proxyUrl.trim());
    
    return {
      protocol: url.protocol.replace(':', ''),
      host: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      auth: url.username && url.password ? {
        username: url.username,
        password: url.password
      } : undefined
    };
  } catch (err) {
    warn(`Invalid proxy URL format: ${err.message}`);
    return null;
  }
}

/**
 * Fetches raw HTML from a Reddit subreddit's /new page with anti-blocking measures
 * @param {string} subreddit - Subreddit name (without r/)
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @returns {Promise<string|null>} - Raw HTML content or null if blocked/failed
 */
export async function fetchSubredditHtml(subreddit, maxRetries = 3) {
  const url = `https://www.reddit.com/r/${subreddit}/new`;
  const proxyConfig = getProxyConfig();
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Random delay before request to reduce bot detection
      if (attempt === 1) {
        const delay = 300 + Math.random() * 500;
        await sleep(delay);
      }
      
      log(`Fetching r/${subreddit}... (attempt ${attempt}/${maxRetries})`);
      
      // Get random User-Agent and headers
      const userAgent = getRandomUserAgent();
      const headers = getBrowserHeaders(userAgent);
      
      // Build axios config
      const axiosConfig = {
        headers,
        timeout: 15000, // 15 second timeout
        validateStatus: (status) => status < 500, // Don't throw on 403/404
        maxRedirects: 5
      };
      
      // Add proxy if configured
      if (proxyConfig) {
        axiosConfig.proxy = proxyConfig;
        log(`Using proxy: ${proxyConfig.host}:${proxyConfig.port}`);
      }
      
      const response = await axios.get(url, axiosConfig);
      
      // Check for 403 or other blocking status codes
      if (response.status === 403) {
        warn(`Blocked by Reddit (403) for r/${subreddit}. Retrying...`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Check for non-200 status
      if (response.status !== 200) {
        warn(`HTTP ${response.status} for r/${subreddit}. Retrying...`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Get HTML content
      const html = response.data;
      
      // Check if HTML is empty
      if (!html || html.length === 0) {
        warn(`Empty HTML response for r/${subreddit}. Retrying...`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Check if blocked by content analysis
      if (isBlocked(html)) {
        warn(`Blocked by Reddit (403 fallback) for r/${subreddit}. Retrying...`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Success!
      log(`Successfully fetched r/${subreddit} (${html.length} bytes)`);
      return html;
      
    } catch (err) {
      // Handle timeout or network errors
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        warn(`Timeout fetching r/${subreddit}. Retrying...`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Handle connection errors
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
        error(`Connection error fetching r/${subreddit}: ${err.message}`);
        if (attempt < maxRetries) {
          const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
          await sleep(backoffDelay);
          continue;
        }
        return null;
      }
      
      // Other errors
      error(`Failed to fetch r/${subreddit} (attempt ${attempt}/${maxRetries})`, err);
      if (attempt < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 1000, 5000);
        await sleep(backoffDelay);
        continue;
      }
      return null;
    }
  }
  
  // All retries exhausted
  error(`Failed to fetch r/${subreddit} after ${maxRetries} attempts`);
  return null;
}

