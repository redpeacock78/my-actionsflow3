/**
 * Actionsflow custom RSS trigger
 *
 * Official RSS trigger compatible version with one difference:
 *
 *   RSS/XML parse error
 *     -> treat that feed as an empty feed
 *     -> continue processing remaining URLs
 *
 * Network / HTTP / timeout errors are NOT swallowed.
 *
 * Put this file at:
 *
 *   ./triggers/rss.js
 *
 * Because local triggers take precedence over built-in triggers,
 * `on.rss` will use this implementation automatically.
 */

class Rss {
  constructor({ helpers, options }) {
    this.helpers = helpers;
    this.options = options || {};
  }

  /**
   * Same item-key strategy as the official RSS trigger.
   *
   * This is important because Actionsflow's common trigger layer
   * uses this method for deduplication.
   */
  getItemKey(item) {
    if (item.guid) {
      return item.guid;
    }

    if (item.link) {
      return item.link;
    }

    if (item.id) {
      return item.id;
    }

    return this.helpers.createContentDigest(item);
  }

  async run() {
    const {
      url,
      parserConfig = {},

      /**
       * Custom option.
       *
       * true:
       *   XML/RSS parse errors are treated as an empty feed.
       *
       * false:
       *   Behave like the official RSS trigger and throw the error.
       */
      skipOnParseError = true,
    } = this.options;

    let urls;

    if (Array.isArray(url)) {
      if (url.length === 0) {
        throw new Error("url must be provided one at least");
      }

      urls = url;
    } else {
      if (!url) {
        throw new Error("Missing required param: url");
      }

      urls = [url];
    }

    const items = [];

    for (const feedUrl of urls) {
      const parser = new this.helpers.rssParser(parserConfig);

      /*
       * rss-parser's parseURL() does roughly:
       *
       *   HTTP GET
       *      ↓
       *   collect XML string
       *      ↓
       *   this.parseString(xml)
       *
       * So we intercept ONLY parseString().
       *
       * That means:
       *
       *   malformed XML        -> []
       *   invalid RSS          -> []
       *   empty response body  -> []
       *
       * but:
       *
       *   DNS error            -> throw
       *   ECONNREFUSED         -> throw
       *   HTTP 404 / 500       -> throw
       *   timeout              -> throw
       *
       * This keeps network behavior equivalent to the official trigger.
       */

      if (skipOnParseError) {
        const originalParseString = parser.parseString.bind(parser);

        parser.parseString = async (xml) => {
          try {
            return await originalParseString(xml);
          } catch (error) {
            return {
              items: [],
            };
          }
        };
      }

      let feed;

      try {
        feed = await parser.parseURL(feedUrl);
      } catch (error) {
        /*
         * At this point parse errors have already been consumed above.
         *
         * Anything reaching here is therefore normally a fetch /
         * connection / HTTP / timeout error, so preserve the official
         * trigger's fail-fast behavior.
         */

        if (error && error.code === "ECONNREFUSED") {
          throw new Error(
            `It was not possible to connect to the URL. ` +
            `Please make sure the URL "${feedUrl}" is valid!`
          );
        }

        this.helpers.log.error(
          `fetch rss feed [${feedUrl}] error: `,
          error
        );

        throw error;
      }

      /*
       * Same behavior as the official RSS trigger:
       * collect only feed.items and merge all configured feeds.
       */
      if (feed && Array.isArray(feed.items)) {
        items.push(...feed.items);
      }
    }

    return items;
  }
}

module.exports = Rss;
