/* global fetch */
/* eslint prefer-arrow-callback: "off", no-unused-vars: "off" */

/**
 * Shared map utilities for MapLibre GL maps
 */

// Working glyph server to replace broken OpenFreeMap fonts
const WORKING_GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

/**
 * Fetches the map style and overrides the glyphs URL with a working font server.
 * This is needed because OpenFreeMap's font server returns 404s for some font ranges.
 * @param {string} styleUrl - The original map style URL
 * @returns {Promise<Object>} - The modified style object
 */
async function loadMapStyleWithWorkingFonts(styleUrl) {
  try {
    const response = await fetch(styleUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch style: ${response.status}`);
    }
    const style = await response.json();
    style.glyphs = WORKING_GLYPHS_URL;
    return style;
  } catch (error) {
    console.error('Error loading map style:', error);
    // Return a minimal fallback style
    return {
      version: 8,
      glyphs: WORKING_GLYPHS_URL,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f0f0f0' } }],
    };
  }
}
