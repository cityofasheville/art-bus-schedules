document.addEventListener('DOMContentLoaded', () => {
  // Nominatim geocoder with Asheville area bounding box
  const GEOCODER_URL = 'https://nominatim.openstreetmap.org/search';
  // Bounding box for Asheville/Buncombe County area: west, south, east, north
  const VIEWBOX = '-82.8,35.4,-82.3,35.7';
  const DEBOUNCE_DELAY = 300;
  const MIN_CHARS = 3;

  initAutocomplete('#trip_planner_input_source', '#trip_planner_input_source_suggestions');
  initAutocomplete(
    '#trip_planner_input_destination',
    '#trip_planner_input_destination_suggestions',
  );

  function initAutocomplete(inputSelector, suggestionsSelector) {
    const input_target = document.querySelector(inputSelector);
    const suggestions_for_input = document.querySelector(suggestionsSelector);
    let debounceTimer = null;
    let highlightedIndex = -1;
    let currentSuggestions = [];

    input_target.addEventListener('input', function () {
      const query = this.value.trim();

      clearTimeout(debounceTimer);

      if (query.length < MIN_CHARS) {
        hideSuggestions();
        return;
      }

      debounceTimer = setTimeout(() => {
        fetchSuggestions(query);
      }, DEBOUNCE_DELAY);
    });

    input_target.addEventListener('keydown', function (e) {
      if (!suggestions_for_input.classList.contains('show')) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          highlightedIndex = Math.min(highlightedIndex + 1, currentSuggestions.length - 1);
          updateHighlight();
          break;
        case 'ArrowUp':
          e.preventDefault();
          highlightedIndex = Math.max(highlightedIndex - 1, 0);
          updateHighlight();
          break;
        case 'Enter':
          if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
            e.preventDefault();
            selectSuggestion(currentSuggestions[highlightedIndex]);
          }
          break;
        case 'Escape':
          hideSuggestions();
          break;
        case 'Tab':
          if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
            selectSuggestion(currentSuggestions[highlightedIndex]);
          } else {
            hideSuggestions();
          }
          break;
      }
    });

    input_target.addEventListener('focus', function () {
      if (currentSuggestions.length > 0) {
        suggestions_for_input.classList.add('show');
      }
    });

    async function fetchSuggestions(query) {
      suggestions_for_input.innerHTML = '<li class="autocomplete-loading">Searching...</li>';
      suggestions_for_input.classList.add('show');

      try {
        const url = `${GEOCODER_URL}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&viewbox=${VIEWBOX}&bounded=1`;
        const response = await fetch(url);
        const data = await response.json();

        currentSuggestions = data || [];
        highlightedIndex = -1;

        if (currentSuggestions.length === 0) {
          suggestions_for_input.innerHTML =
            '<li class="autocomplete-no-results">No locations found</li>';
        } else {
          renderSuggestions();
        }
      } catch (error) {
        console.error('Geocoder error:', error);
        suggestions_for_input.innerHTML =
          '<li class="autocomplete-no-results">Error fetching suggestions</li>';
      }
    }

    function renderSuggestions() {
      const html = currentSuggestions
        .map((suggestion, index) => {
          // Use display_name from Nominatim, truncate if too long
          const displayText =
            suggestion.display_name.length > 80
              ? suggestion.display_name.substring(0, 80) + '...'
              : suggestion.display_name;
          return `<li role="option" data-index="${index}" aria-selected="false">${escapeHtml(displayText)}</li>`;
        })
        .join('');

      suggestions_for_input.innerHTML = html;
      suggestions_for_input.classList.add('show');

      suggestions_for_input.querySelectorAll('li').forEach(function (li) {
        li.addEventListener('click', function () {
          const index = parseInt(this.dataset.index, 10);
          if (currentSuggestions[index]) {
            selectSuggestion(currentSuggestions[index]);
          }
        });
      });
    }

    function updateHighlight() {
      suggestions_for_input.querySelectorAll('li').forEach(function (li) {
        li.classList.remove('highlighted');
        li.setAttribute('aria-selected', 'false');
      });
      if (highlightedIndex >= 0) {
        const highlighted = suggestions_for_input.querySelector(
          `li[data-index="${highlightedIndex}"]`,
        );
        if (highlighted) {
          highlighted.classList.add('highlighted');
          highlighted.setAttribute('aria-selected', 'true');
        }
      }
    }

    function selectSuggestion(suggestion) {
      // Use display_name from Nominatim
      input_target.value = suggestion.display_name;
      hideSuggestions();
      input_target.dispatchEvent(new Event('change'));
    }

    function hideSuggestions() {
      suggestions_for_input.classList.remove('show');
      highlightedIndex = -1;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest(inputSelector) && !e.target.closest(suggestionsSelector)) {
        hideSuggestions();
      }
    });
  }

  document.querySelector('#trip_planner_form').addEventListener('submit', function (e) {
    e.preventDefault();
    const source = document.querySelector('#trip_planner_input_source').value;
    const destination = document.querySelector('#trip_planner_input_destination').value;
    const departure_date = document.querySelector('#trip_planner_input_date').value;
    const departure_time = document.querySelector('#trip_planner_input_time').value;
    const tripPreference = document.querySelector('#trip_planner_input_trip_preference').value;

    // Use legacy Google Maps URL format which supports departure time and transit preferences
    // dirflg: r=transit, w=walking, d=driving, b=bicycling
    // ttype: dep=depart at, arr=arrive by
    // transit preferences: rail, bus, subway, tram (can combine with commas)

    const params = new URLSearchParams();
    params.append('saddr', source);
    params.append('daddr', destination);
    params.append('dirflg', 'r');

    // Add departure date and time if provided
    if (departure_date && departure_time) {
      params.append('ttype', 'dep');

      // Format date as MM/DD/YYYY
      const [year, month, day] = departure_date.split('-');
      params.append('date', `${month}/${day}/${year}`);

      // Format time as h:mma (e.g., 2:30pm)
      const [hours, minutes] = departure_time.split(':');
      const hour12 = hours % 12 || 12;
      const ampm = hours >= 12 ? 'pm' : 'am';
      params.append('time', `${hour12}:${minutes}${ampm}`);
    }

    // Add transit routing preference if selected
    // Google Maps legacy URL uses: fewer_transfers as default,
    // less_walking requires using different transit modes
    if (tripPreference === 'fewer_transfers') {
      params.append('transmode', 'r'); // prefer rail/fewer transfers
    } else if (tripPreference === 'less_walking') {
      params.append('transmode', 'b,s,t,r'); // all transit modes to minimize walking
    }

    const finalUrl = `https://www.google.com/maps?${params.toString()}`;

    window.open(finalUrl, '_blank');
  });
});
