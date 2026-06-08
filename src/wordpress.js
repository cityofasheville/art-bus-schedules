import sanitizeHtml from 'sanitize-html';

const WP_BASE = 'https://www.ashevillenc.gov/wp-json/wp/v2';

// see: https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html
const SANITIZE_OPTIONS = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'iframe']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'title'],
    th: ['scope', 'colspan', 'rowspan'],
  },
  allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com'],
};

const WP_ENDPOINTS = [
  { key: 'howToRide', path: '/services/468?_fields=title,content' },
  { key: 'reportIssues', path: '/services/492?_fields=title,content' },
  { key: 'faresAndPasses', path: '/services/424?_fields=title,content' },
  { key: 'holidays', path: '/departments/141640?_fields=title,content' },
  { key: 'ada', path: '/services/494?_fields=title,content' },
  { key: 'bikesOnBuses', path: '/services/481?_fields=title,content' },
  { key: 'wifiTerms', path: '/departments/92483?_fields=title,content' },
  { key: 'wifiFaqs', path: '/departments/93145?_fields=title,content' },
  { key: 'passport', path: '/departments/99420?_fields=title,content' },
  { key: 'policiesAndTips', path: '/services/488?_fields=title,content' },
  {
    key: 'transitHomepage',
    path: '/departments/861?_fields=title,content,acf',
    // this response doesn't fit the standard shape of title and content.
    customHandler: (data_in, data_out) => {
      data_out.transitConnect = data_in.acf;
      data_out.transitAbout = {
        title: { rendered: sanitizeHtml(data_in.title.rendered) },
        content: { rendered: sanitizeHtml(data_in.content.rendered, SANITIZE_OPTIONS) },
      };
    },
  },
  {
    key: 'transitNews',
    path: '/posts?avl_department=64&per_page=3&orderby=date&order=desc&_fields=id,title,excerpt,date,link,featured_media,_links&_embed=wp:featuredmedia',
    // this response doesn't fit the standard shape of title and content.
    customHandler: (data_in, data_out) => {
      data_out.transitNews = data_in.map((post) => ({
        ...post,
        title: { ...post.title, rendered: sanitizeHtml(post.title.rendered) },
        excerpt: {
          ...post.excerpt,
          rendered: sanitizeHtml(post.excerpt.rendered, SANITIZE_OPTIONS),
        },
      }));
    },
  },
];

/**
 * Fetches and sanitizes content from every endpoint in `WP_ENDPOINTS`.
 *
 * @returns {Promise<Object>} Map of endpoint `key` (or `customHandler`-assigned keys)
 *   to sanitized page data.
 * @throws {Error} If any endpoint responds with a non-OK HTTP status.
 */
export async function getWordPressData() {
  try {
    const responses = await Promise.all(
      WP_ENDPOINTS.map((endpoint) => fetch(`${WP_BASE}${endpoint.path}`)),
    );

    responses.forEach((response, i) => {
      if (!response.ok) {
        throw new Error(`HTTP error fetching ${WP_ENDPOINTS[i].key}! status: ${response.status}`);
      }
    });

    const payloads = await Promise.all(responses.map((response) => response.json()));

    const wpDataToReturn = {};
    payloads.forEach((payload, i) => {
      const endpoint = WP_ENDPOINTS[i];
      if (endpoint.customHandler) {
        endpoint.customHandler(payload, wpDataToReturn);
      } else {
        wpDataToReturn[endpoint.key] = {
          title: { rendered: sanitizeHtml(payload.title.rendered) },
          content: { rendered: sanitizeHtml(payload.content.rendered, SANITIZE_OPTIONS) },
        };
      }
    });

    return wpDataToReturn;
  } catch (error) {
    console.error('Failed to fetch data from WordPress API:', error.message);
    throw error;
  }
}
