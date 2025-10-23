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

  // $('button#hamburger').on('click', function () {
  //   if ($(this).attr('aria-expanded') === 'false') {
  //     $('#top-menu-container').slideDown('slow');
  //   } else {
  //     $('#top-menu-container').slideUp('slow');
  //   }
  // });
});
