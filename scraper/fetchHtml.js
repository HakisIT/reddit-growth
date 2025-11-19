import axios from 'axios';
import { log, error } from '../utils/logger.js';

/**
 * Fetches raw HTML from a Reddit subreddit's /new page
 * @param {string} subreddit - Subreddit name (without r/)
 * @returns {Promise<string>} - Raw HTML content
 */
export async function fetchSubredditHtml(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/new`;
  
  try {
    log(`Fetching r/${subreddit}...`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    log(`Successfully fetched r/${subreddit} (${response.data.length} bytes)`);
    return response.data;
    
  } catch (err) {
    error(`Failed to fetch r/${subreddit}`, err);
    throw err;
  }
}

