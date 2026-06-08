document.addEventListener('DOMContentLoaded', function () {
  const toggleButton = document.getElementById('hamburger');
  const menu = document.getElementById('top-menu-container');

  toggleButton.addEventListener('click', function () {
    menu.classList.toggle('hidden');

    const currentAriaExpanded = toggleButton.getAttribute('aria-expanded');
    if (currentAriaExpanded === 'true') {
      toggleButton.setAttribute('aria-expanded', 'false');
    } else {
      toggleButton.setAttribute('aria-expanded', 'true');
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // Select all dropdown toggle buttons
  const dropdownToggles = document.querySelectorAll('.dropdown-toggle');

  dropdownToggles.forEach((toggle) => {
    try {
      toggle.addEventListener('click', () => {
        const dropdownId = toggle.getAttribute('data-dropdown-id');
        const dropdownMenu = document.getElementById(dropdownId);

        // Toggle the 'hidden' class to show or hide the dropdown menu
        if (dropdownMenu.classList.contains('hidden')) {
          // Hide any open dropdown menus before showing the targeted menu
          hideAllDropdowns();
          // now show the targeted menu
          toggle.setAttribute('aria-expanded', 'true');
          dropdownMenu.classList.remove('hidden');
        } else {
          // close the targeted menu
          toggle.setAttribute('aria-expanded', 'false');
          dropdownMenu.classList.add('hidden');
        }
      });
    } catch (e) {
      console.log(e);
    }
  });

  // Clicking outside of an open dropdown menu closes it
  window.addEventListener('click', function (e) {
    // Check if the click is outside the dropdown or dropdown-toggle
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.dropdown-toggle')) {
      hideAllDropdowns();
    }
  });

  // Function to hide all dropdown menus
  function hideAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach((menu) => {
      if (!menu.classList.contains('news-dropdown-menu')) {
        menu.classList.add('hidden');
      }
    });
    document.querySelectorAll('.dropdown-toggle').forEach((toggle) => {
      if (!toggle.classList.contains('news-dropdown-toggle')) {
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Add event listener for the 'Escape' key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideAllDropdowns();
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.feedback-form-link').forEach(function (feedbackLink) {
    feedbackLink.addEventListener('click', function (e) {
      e.preventDefault();
      var url =
        'https://forms.ashevillenc.gov/form/art-website-feedback?referringpath=' +
        encodeURIComponent(window.location.pathname + window.location.search);
      window.open(url, this.target || '_self');
    });
  });
  const trigger = document.getElementById('feedback-trigger');
  const popup = document.getElementById('feedback-popup');
  const close = document.getElementById('feedback-popup-close');
  function toggle() {
    const open = popup.classList.toggle('hidden');
    trigger.setAttribute('aria-expanded', !open);
  }
  trigger.addEventListener('click', toggle);
  close.addEventListener('click', toggle);
  document.addEventListener('click', function (e) {
    if (!document.getElementById('feedback-widget').contains(e.target)) {
      popup.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !popup.classList.contains('hidden')) {
      popup.classList.add('hidden');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.focus();
    }
  });
});
