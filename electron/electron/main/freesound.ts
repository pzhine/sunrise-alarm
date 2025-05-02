// Freesound API service
// Documentation: https://freesound.org/docs/api/resources_apiv2.html

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import fetch from 'node-fetch';
import {
  FreesoundSearchResult,
  FreesoundSearchResponse,
  CachedSearchData,
} from '../../types/sound';
import countryNamesData from '../../assets/countryNames.json';
import { getConfig } from './configManager';

const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);

// API constants
const BASE_URL = 'https://freesound.org/apiv2';

// Cache directory path
const getCacheDirPath = () => {
  return path.join(app.getPath('userData'), 'freesound-cache');
};

// Ensure cache directory exists
const ensureCacheDir = async () => {
  const cacheDir = getCacheDirPath();
  try {
    await mkdir(cacheDir, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      console.error('Error creating cache directory:', error);
      throw error;
    }
  }
  return cacheDir;
};

// Get cache file path for a search query
const getCacheFilePath = (query: string) => {
  // Create a safe filename from the query
  const safeFilename = query.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  return path.join(getCacheDirPath(), `${safeFilename}.json`);
};

// Cache to store already looked up coordinates and their corresponding countries
const geocodeCache: Record<string, string> = {};

/**
 * Convert ISO country code to full country name
 */
function getCountryName(code: string): string {
  return countryNamesData[code] || 'Unknown';
}

/**
 * Get country code from latitude and longitude
 */
async function getCountryFromCoordinates(
  lat: number,
  lon: number
): Promise<string> {
  // Get API key from config
  const config = getConfig();
  const API_KEY = config.openWeather.apiKey;
  const BASE_URL = 'https://api.openweathermap.org/geo/1.0/reverse';

  // Generate cache key
  const cacheKey = `${lat},${lon}`;

  // Return from cache if available
  if (geocodeCache[cacheKey]) {
    return geocodeCache[cacheKey];
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.append('lat', lat.toString());
    url.searchParams.append('lon', lon.toString());
    url.searchParams.append('limit', '1'); // We only need one result
    url.searchParams.append('appid', API_KEY);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `OpenWeather API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any[];

    if (data && data.length > 0) {
      // Store in cache and return
      const countryCode = data[0].country;
      geocodeCache[cacheKey] = countryCode;
      return countryCode;
    } else {
      return 'Unknown';
    }
  } catch (error) {
    console.error('Error getting country from coordinates:', error);
    return 'Unknown';
  }
}

// Check if cache is valid (less than 24 hours old)
async function isCacheValid(cacheFilePath: string): Promise<boolean> {
  try {
    const stats = await stat(cacheFilePath);
    const now = Date.now();
    const cacheAge = now - stats.mtimeMs;
    return cacheAge < 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  } catch (error) {
    return false;
  }
}

// Rate limit requests to avoid hitting API limits
function createRateLimitedGeocoder(rateLimit = 10) {
  const queue: Array<{
    lat: number;
    lon: number;
    resolve: (country: string) => void;
  }> = [];
  let processing = false;

  const processQueue = async () => {
    if (processing || queue.length === 0) return;

    processing = true;
    const batch = queue.splice(0, rateLimit);

    // Process each item in the batch
    const promises = batch.map(async (item) => {
      const country = await getCountryFromCoordinates(item.lat, item.lon);
      item.resolve(country);
    });

    await Promise.all(promises);

    processing = false;

    // Process more items if any remain in the queue
    if (queue.length > 0) {
      setTimeout(processQueue, 1000); // Wait 1 second between batches
    }
  };

  return (lat: number, lon: number): Promise<string> => {
    return new Promise((resolve) => {
      // Add to queue
      queue.push({ lat, lon, resolve });

      // Start processing if not already
      processQueue();
    });
  };
}

// Create a rate-limited geocoder instance
const rateLimitedGeocoder = createRateLimitedGeocoder(10);

/**
 * Search for sounds with caching
 */
export async function searchSoundsWithCache(
  query: string,
  page: number = 1,
  pageSize: number = 100,
  fields: string = 'id,name,tags,username,license,previews,geotag,duration'
): Promise<FreesoundSearchResponse> {
  const API_KEY = getConfig().freesound.apiKey;

  await ensureCacheDir();
  const cacheFilePath = getCacheFilePath(query);

  // Check if cache exists and is valid
  if (await isCacheValid(cacheFilePath)) {
    try {
      const cachedData = JSON.parse(
        await readFile(cacheFilePath, 'utf8')
      ) as CachedSearchData;
      console.log(`Using cached results for "${query}"`);
      return cachedData.response;
    } catch (error) {
      console.error('Error reading cache file:', error);
      // Continue to fetch fresh data if cache read fails
    }
  }

  // Fetch fresh data
  console.log(`Fetching fresh results for "${query}"`);
  const url = new URL(`${BASE_URL}/search/text/`);

  // Add query parameters
  url.searchParams.append('query', query);
  url.searchParams.append('page', page.toString());
  url.searchParams.append('page_size', pageSize.toString());
  url.searchParams.append('fields', fields);
  url.searchParams.append('token', API_KEY);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Freesound API error: ${response.status} ${response.statusText}`
      );
    }

    const searchResponse = (await response.json()) as FreesoundSearchResponse;

    // Cache will be created when groupSoundsByCountryWithCache is called
    return searchResponse;
  } catch (error) {
    console.error('Error searching sounds:', error);
    throw error;
  }
}

/**
 * Group sounds by country with caching
 */
export async function groupSoundsByCountryWithCache(
  query: string,
  sounds?: FreesoundSearchResult[]
): Promise<Record<string, FreesoundSearchResult[]>> {
  await ensureCacheDir();
  const cacheFilePath = getCacheFilePath(query);

  // Check if cache exists and is valid
  if (await isCacheValid(cacheFilePath)) {
    try {
      const cachedData = JSON.parse(
        await readFile(cacheFilePath, 'utf8')
      ) as CachedSearchData;
      console.log(`Using cached country grouping for "${query}"`);
      return cachedData.countrySounds;
    } catch (error) {
      console.error('Error reading cache file:', error);
      // Continue to process if cache read fails
    }
  }

  // If no sounds provided, fetch them
  if (!sounds) {
    const response = await searchSoundsWithCache(query);
    sounds = response.results;
  }

  // Group sounds by country
  const countryGroups: Record<string, FreesoundSearchResult[]> = {};
  const soundLookups: Promise<void>[] = [];

  sounds.forEach((sound) => {
    // If the sound has a geotag, look up the country
    if (sound.geotag) {
      const [lat, lon] = sound.geotag.split(' ').map(Number);
      if (!isNaN(lat) && !isNaN(lon)) {
        const lookup = rateLimitedGeocoder(lat, lon)
          .then((countryCode) => {
            const countryName = getCountryName(countryCode);
            if (!countryGroups[countryName]) {
              countryGroups[countryName] = [];
            }
            countryGroups[countryName].push(sound);
          })
          .catch(() => {
            // If geocoding fails, add to Unknown
            if (!countryGroups['Unknown']) {
              countryGroups['Unknown'] = [];
            }
            countryGroups['Unknown'].push(sound);
          });

        soundLookups.push(lookup);
      } else {
        // Invalid geotag format
        if (!countryGroups['Unknown']) {
          countryGroups['Unknown'] = [];
        }
        countryGroups['Unknown'].push(sound);
      }
    } else {
      // No geotag
      if (!countryGroups['Unknown']) {
        countryGroups['Unknown'] = [];
      }
      countryGroups['Unknown'].push(sound);
    }
  });

  // Wait for all geocoding lookups to complete
  await Promise.all(soundLookups);

  // Get or fetch the search response
  let searchResponse: FreesoundSearchResponse;
  try {
    // Try to read from cache first
    const cachedData = JSON.parse(
      await readFile(cacheFilePath, 'utf8')
    ) as CachedSearchData;
    searchResponse = cachedData.response;
  } catch (error) {
    // If cache doesn't exist, fetch fresh data
    searchResponse = await searchSoundsWithCache(query);
  }

  // Cache the results
  const cacheData: CachedSearchData = {
    timestamp: Date.now(),
    response: searchResponse,
    countrySounds: countryGroups,
  };

  try {
    await writeFile(cacheFilePath, JSON.stringify(cacheData), 'utf8');
    console.log(`Cached results for "${query}"`);
  } catch (error) {
    console.error('Error writing cache file:', error);
  }

  return countryGroups;
}
