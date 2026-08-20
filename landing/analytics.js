(function () {
  // 1. Вставь сюда ключ проекта PostHog (Settings → Project → API keys → Project API key).
  // 2. Для EU-облака host = "https://eu.i.posthog.com", для US — "https://us.i.posthog.com".
  var POSTHOG_KEY = "phc_uYyDf5PbknHz9TZhskdBhAeX2LD2uNSXhApkF9fR8ykP";
  var POSTHOG_HOST = "https://eu.i.posthog.com";

  if (!POSTHOG_KEY) return;

  (function loadArrayScript() {
    var o = document.createElement("script");
    var n = document.getElementsByTagName("script")[0];
    o.async = 1;
    o.src = POSTHOG_HOST + "/static/array.js";
    if (n && n.parentNode) n.parentNode.insertBefore(o, n);
  })();

  function waitForPosthog(cb, attempts) {
    attempts = attempts || 0;
    if (window.posthog && window.posthog.init) {
      cb();
      return;
    }
    if (attempts > 20) return;
    setTimeout(function () {
      waitForPosthog(cb, attempts + 1);
    }, 100);
  }

  waitForPosthog(function () {
    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: true,
    });

    function send(event, props) {
      window.posthog.capture(event, props || {});
    }

    send("landing_view", { lang: document.documentElement.lang || "ru" });

    // Все CTA ведут в Telegram — считаем и клик по CTA, и открытие Telegram.
    document.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== document) {
        if (el.tagName === "A" && el.getAttribute("href")) {
          var href = el.getAttribute("href");
          if (href.indexOf("t.me") !== -1) {
            send("landing_cta_click", {
              href: href,
              lang: document.documentElement.lang || "ru",
            });
            send("telegram_open", {
              lang: document.documentElement.lang || "ru",
            });
          }
          break;
        }
        el = el.parentNode;
      }
    });
  });
})();