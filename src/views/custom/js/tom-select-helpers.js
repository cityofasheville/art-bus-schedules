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
 * @param {boolean} [options.focusToggleOnOpen=true] - If true, focus stays on the toggle button when it opens the list. If false, focus moves to the text input (Tom Select default).
 * @returns {TomSelect} The Tom Select instance
 */
function createAccessibleTomSelect(selector, options) {
  const {
    dropdownParent,
    labelId,
    onChange,
    placeholder,
    maxOptions = null,
    focusToggleOnOpen = false,
  } = options;

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

      // Override onBlur on the instance so that when focus moves to our
      // toggle button, Tom Select doesn't close the dropdown. The original
      // blur event listener (an arrow function: t=>e.onBlur(t)) looks up
      // onBlur via property access, so overriding it here takes effect.
      const originalOnBlur = self.onBlur.bind(self);
      self.onBlur = function (e) {
        if (e && e.relatedTarget === toggleBtn) {
          return; // Don't close when focus goes to our button
        }
        originalOnBlur(e);
      };

      toggleBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
      });

      toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (self.isOpen) {
          self.close();
          if (focusToggleOnOpen) {
            toggleBtn.focus();
          }
        } else {
          if (focusToggleOnOpen) {
            // Set internal state without focusing the input (avoids mobile keyboard)
            self.isFocused = true;
            self.open();
            toggleBtn.focus();
          } else {
            self.control_input.focus();
            self.open();
          }
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
