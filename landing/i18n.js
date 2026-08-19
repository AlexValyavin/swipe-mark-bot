(function () {
  var I18N = {
    ru: {
      title: "SwipeMark — разгреби свои сохранёнки",
      desc: "Отправляй ссылки в Telegram, а SwipeMark поможет быстро разобрать их с помощью свайпов и AI.",
      ogTitle: "SwipeMark — разгреби свои сохранёнки",
      navCta: "Открыть в Telegram →",
      badge: "Telegram Mini App · PWA",
      heroTitle1: "Разгреби свои",
      heroTitle2: "сохранёнки",
      heroSub: "Отправляй ссылки в Telegram, а SwipeMark поможет быстро разобрать их с помощью свайпов и AI.",
      openBot: "Открыть бота",
      howItWorks: "Как это работает ↓",
      heroMeta: "Сохранить → понять → решить",
      problemTitle: "Ты сохраняешь всё. Потом ничего не находишь.",
      problem1: "«Посмотреть потом», «сохранить на всякий случай», «это надо прочитать».",
      problem2: "Через год — 800 сохранённых сообщений, и ты уже ничего не помнишь.",
      problem3: "Разгребать вручную по папкам — монотонная работа, на которую не хватает сил.",
      howTitle: "Свайпай — как в карточной колоде",
      howSub: "Колода карточек. Одно решение — один свайп.",
      step1Title: "Сохраняй",
      step1Text: "Ссылка, фото или видео боту — карточка готова сама: заголовок, превью, источник.",
      step2Title: "Разбирай",
      step2Text: "Влево — в архив, вправо — потом, вверх — открыть. Прогресс-бар над колодой держит в тонусе.",
      step3Title: "Решай",
      step3Text: "AI подскажет папку и теги, перескажет «Кратко» — и ты освобождаешь голову.",
      screensTitle: "Вот как это выглядит",
      shotDeck: "Колода: свайпай и разбирай",
      shotCard: "Карточка: заголовок, «Кратко», теги",
      shotCompletion: "Итоги сессии: оставил / потом / архив",
      shotLibrary: "Мои сохранёнки: папки, теги, поиск",
      shotOnboarding: "Онбординг: «Разгреби свои сохранёнки»",
      shotEmpty: "Пустая колода — пора сохранить что-нибудь",
      aiTitle: "AI помогает решить, что делать с ссылкой",
      aiText: "Не «у нас есть AI», а AI, который перескажет, предложит папку и теги — чтобы решение принималось за один свайп.",
      aiF1: "📖 Кратко по запросу",
      aiF2: "📁 Предложение папки",
      aiF3: "🏷 Теги за один приём",
      aiF4: "⚡ Разложить всё сразу",
      ctaTitle: "Готов начать разгребать?",
      ctaText: "Открой бота в Telegram — первая карточка появится через минуту.",
      ctaBtn: "Открыть @SwipeMarkBot",
    },
    en: {
      title: "SwipeMark — clear your saved pile",
      desc: "Send links to Telegram, and SwipeMark helps you sort them fast with swipes and AI.",
      ogTitle: "SwipeMark — clear your saved pile",
      navCta: "Open in Telegram →",
      badge: "Telegram Mini App · PWA",
      heroTitle1: "Clear your",
      heroTitle2: "saved pile",
      heroSub: "Send links to Telegram, and SwipeMark helps you sort them fast with swipes and AI.",
      openBot: "Open the bot",
      howItWorks: "How it works ↓",
      heroMeta: "Save → understand → decide",
      problemTitle: "You save everything. Then you find nothing.",
      problem1: "“Watch later”, “save just in case”, “I should read this”.",
      problem2: "A year later — 800 saved messages, and you don't remember any of them.",
      problem3: "Sorting everything into folders by hand is tedious work you never get to.",
      howTitle: "Swipe like a deck of cards",
      howSub: "A stack of cards. One decision — one swipe.",
      step1Title: "Save",
      step1Text: "Send a link, photo or video to the bot — the card is ready: title, preview, source.",
      step2Title: "Sort",
      step2Text: "Swipe left to archive, right to keep, up to open. The progress bar keeps you going.",
      step3Title: "Decide",
      step3Text: "AI suggests a folder and tags, summarizes the key points — and you free your mind.",
      screensTitle: "Here's what it looks like",
      shotDeck: "The deck: swipe and sort",
      shotCard: "The card: title, summary, tags",
      shotCompletion: "Session results: kept / later / archived",
      shotLibrary: "My library: folders, tags, search",
      shotOnboarding: "Onboarding: “Clear your saved pile”",
      shotEmpty: "Empty deck — time to save something",
      aiTitle: "AI helps you decide what to do with a link",
      aiText: "Not “we have AI”, but AI that summarizes, suggests a folder and tags — so a decision takes one swipe.",
      aiF1: "📖 Summary on demand",
      aiF2: "📁 Folder suggestion",
      aiF3: "🏷 Tags in one go",
      aiF4: "⚡ Sort everything at once",
      ctaTitle: "Ready to start clearing?",
      ctaText: "Open the bot in Telegram — your first card appears within a minute.",
      ctaBtn: "Open @SwipeMarkBot",
    },
  };

  var STORAGE_KEY = "swipe-landing-lang";

  function currentLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "ru" || stored === "en") return stored;
    } catch (e) {}
    return document.documentElement.lang === "en" ? "en" : "ru";
  }

  function apply(lang) {
    var dict = I18N[lang];
    document.documentElement.lang = lang;

    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-i18n");
      if (dict[key]) nodes[i].textContent = dict[key];
    }

    var attrs = document.querySelectorAll("[data-i18n-attr]");
    for (var j = 0; j < attrs.length; j++) {
      var spec = attrs[j].getAttribute("data-i18n-attr");
      var parts = spec.split(":");
      if (parts.length === 2 && dict[parts[1]]) {
        attrs[j].setAttribute(parts[0], dict[parts[1]]);
      }
    }

    var toggle = document.getElementById("lang-toggle");
    if (toggle) toggle.textContent = lang === "ru" ? "EN" : "РУ";

    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {}
  }

  function toggle() {
    apply(currentLang() === "ru" ? "en" : "ru");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var toggle = document.getElementById("lang-toggle");
    if (toggle) toggle.addEventListener("click", toggle);
    apply(currentLang());
  });
})();