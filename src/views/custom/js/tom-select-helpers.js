/* global TomSelect */
/* eslint no-unused-vars: "off" */

/**
 * Creates a Tom Select instance with an accessible toggle button and
 * mobile-friendly behavior (openOnFocus disabled, opens on typing).
 *
 * @param {string|HTMLElement} selector - CSS selector or DOM element for the <select>
 * @param {object} options - Configuration options
 * @param {string} options.dropdownParent - CSS selector for the dropdown parent container
 * @param {string} options.labelId - ID of the <label> element for aria-labelledby
 * @param {function} options.onChange - Callback when value changes
 * @param {string} [options.placeholder] - Placeholder text
 * @param {number|null} [options.maxOptions] - Max options to display (null = unlimited)
 * @returns {TomSelect} The Tom Select instance
 */
function createAccessibleTomSelect(selector, options) {
  const { dropdownParent, labelId, onChange, placeholder, maxOptions = null } = options;

  return new TomSelect(selector, {
    create: false,
    openOnFocus: false,
    maxOptions: maxOptions,
    sortField: { field: 'text', direction: 'asc' },
    placeholder: placeholder || undefined,
    dropdownParent: dropdownParent,
    refreshThrottle: 50,
    onInitialize: function () {
      if (labelId) {
        this.control_input.setAttribute('aria-labelledby', labelId);
      }

      // Add a visible chevron toggle button to open/close the dropdown
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'ts-toggle-btn';
      toggleBtn.setAttribute('aria-label', 'Toggle dropdown');
      toggleBtn.innerHTML =
        '<i class="bi bi-chevron-down" aria-hidden="true"></i><span class="sr-only">Show options</span>';
      this.control.appendChild(toggleBtn);

      const self = this;
      toggleBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
      });
      toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (self.isOpen) {
          self.close();
        } else {
          self.open();
        }
      });
    },
    onType: function (str) {
      if (str.length > 0 && !this.isOpen) {
        this.open();
      }
    },
    onChange: onChange || undefined,
  });
}
