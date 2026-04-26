/**
 * Normalizes heading hierarchy within .entry-content containers
 * Ensures headings start at h2 level (preserving h1 for page title)
 *
 * @param {string} [selector='.entry-content'] - CSS selector for content containers
 */
function normalizeHeadings(selector = '.entry-content') {
  const containers = document.querySelectorAll(selector);

  containers.forEach((container) => {
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

    if (headings.length === 0) return;

    // Find the minimum heading level currently in use
    let minLevel = 6;
    headings.forEach((heading) => {
      const level = parseInt(heading.tagName.charAt(1), 10);
      if (level < minLevel) minLevel = level;
    });

    // Calculate offset to shift headings so minimum becomes h2
    const offset = 2 - minLevel;

    // If already starting at h2, no changes needed
    if (offset === 0) return;

    // Replace each heading with the adjusted level
    headings.forEach((heading) => {
      const currentLevel = parseInt(heading.tagName.charAt(1), 10);
      let newLevel = currentLevel + offset;

      // Clamp to valid heading range (h2-h6, never h1)
      newLevel = Math.max(2, Math.min(6, newLevel));

      // Create new heading element with adjusted level
      const newHeading = document.createElement(`h${newLevel}`);

      // Copy all attributes
      Array.from(heading.attributes).forEach((attr) => {
        newHeading.setAttribute(attr.name, attr.value);
      });

      // Move all child nodes
      while (heading.firstChild) {
        newHeading.appendChild(heading.firstChild);
      }

      // Replace the old heading
      heading.parentNode.replaceChild(newHeading, heading);
    });
  });
}

// Auto-run on DOMContentLoaded if not being imported as a module
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    normalizeHeadings();
  });
}
