(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const savedTheme = (() => {
    try { return localStorage.getItem("tala:theme"); } catch (_) { return null; }
  })();
  let theme = savedTheme === "dark" ? "dark" : "light";

  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));

  const SAMPLE = [
    { word: "hello", def: "A greeting said when meeting someone or acknowledging someone’s arrival." },
    { word: "serendipity", def: "The occurrence of fortunate events by chance." },
    { word: "resilient", def: "Able to recover quickly from difficulties; tough." },
    { word: "ephemeral", def: "Lasting for a very short time." },
    { word: "luminous", def: "Full of or shedding light; bright or shining." },
    { word: "petrichor", def: "The pleasant, earthy smell that accompanies the first rain after a long dry spell." }
  ];

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $("#themeToggle")?.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  }

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function normalize(data) {
    const rootWord = (Array.isArray(data) ? data[0]?.word : data?.word) || "";
    const entries = Array.isArray(data) ? data : (data?.entries || []);
    const result = {
      word: rootWord,
      phonetic: "",
      audio: "",
      source: (Array.isArray(data) ? data[0]?.sourceUrls?.[0] : data?.entries?.[0]?.source?.url)
        || `https://en.wiktionary.org/wiki/${encodeURIComponent(rootWord)}`,
      meanings: []
    };
    const groups = {};

    entries.forEach(item => {
      const pronunciations = item.pronunciations || item.phonetics || [];
      pronunciations.forEach(pronunciation => {
        const text = pronunciation.text || (typeof pronunciation === "string" ? pronunciation : "");
        if (!result.phonetic && text) result.phonetic = text;
        if (!result.audio && pronunciation.audio) result.audio = pronunciation.audio;
      });
      if (!result.phonetic && item.phonetic) result.phonetic = item.phonetic;

      if (item.partOfSpeech && item.senses) {
        const group = groups[item.partOfSpeech] ||= { pos: item.partOfSpeech, defs: [], syn: [] };
        item.senses.forEach(sense => {
          if (sense.definition) {
            const example = Array.isArray(sense.examples) ? sense.examples[0] : (sense.example || "");
            group.defs.push({ d: sense.definition, ex: typeof example === "string" ? example : (example?.text || "") });
          }
          (sense.synonyms || []).forEach(synonym => {
            const word = typeof synonym === "string" ? synonym : synonym.word;
            if (word && !group.syn.includes(word)) group.syn.push(word);
          });
        });
      } else if (item.meanings) {
        item.meanings.forEach(meaning => {
          const group = groups[meaning.partOfSpeech] ||= { pos: meaning.partOfSpeech, defs: [], syn: [] };
          (meaning.definitions || []).forEach(definition => group.defs.push({ d: definition.definition, ex: definition.example || "" }));
          [...(meaning.synonyms || []), ...(meaning.definitions?.flatMap(definition => definition.synonyms || []) || [])]
            .forEach(synonym => { if (!group.syn.includes(synonym)) group.syn.push(synonym); });
        });
      }
    });

    result.meanings = Object.values(groups);
    return result;
  }

  async function fetchEntry(word) {
    try {
      const response = await fetch(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}`);
      if (response.ok) return normalize(await response.json());
    } catch (_) {}

    const fallback = SAMPLE.find(item => item.word.toLowerCase() === word.toLowerCase());
    if (fallback) {
      return {
        word: fallback.word,
        phonetic: `/${fallback.word}/`,
        audio: "",
        source: `https://en.wiktionary.org/wiki/${encodeURIComponent(fallback.word)}`,
        meanings: [{ pos: "general", defs: [{ d: fallback.def, ex: "" }], syn: [] }]
      };
    }
    const error = new Error("No dictionary entry found");
    error.notFound = true;
    throw error;
  }

  function showError(title, message) {
    const main = $("#main-card");
    if (!main) return;
    main.innerHTML = `<div class="card error-card">
      <h2>${esc(title)}</h2>
      <p>${esc(message)}</p>
      <button class="chip" data-w="hello">Try “hello”</button>
    </div>`;
  }

  function firstDefinition(entry) {
    return entry.meanings[0]?.defs[0]?.d || "";
  }

  function renderEntry(entry) {
    const main = $("#main-card");
    if (!main) return;

    const meanings = entry.meanings.map(meaning => `
      <div class="posh">${esc(meaning.pos)}</div>
      <ol class="defs">${meaning.defs.map((definition, index) => `
        <li><span class="n">${index + 1}</span><div>
          <div>${esc(definition.d)}</div>
          ${definition.ex ? `<div class="q">“${esc(definition.ex)}”</div>` : ""}
        </div></li>`).join("")}</ol>
      ${meaning.syn.length ? `<div class="syn"><span class="lbl">Synonyms:</span>
        ${meaning.syn.slice(0, 8).map(word => `<button class="chip" data-w="${esc(word)}">${esc(word)}</button>`).join("")}
      </div>` : ""}
    `).join("");

    // Only allow HTTPS links from the dictionary source; otherwise use the known Wiktionary URL.
    let sourceUrl = `https://en.wiktionary.org/wiki/${encodeURIComponent(entry.word)}`;
    try {
      const parsed = new URL(entry.source);
      if (parsed.protocol === "https:") sourceUrl = parsed.href;
    } catch (_) {}

    main.innerHTML = `<article class="card">
      <div class="wordhead"><span class="lbl">Definition</span></div>
      <h2 class="word">${esc(entry.word)}</h2>
      <div class="pron">
        <button class="icon-btn" id="b-play">▶ Listen</button>
        <span>${esc(entry.phonetic)}</span>
      </div>
      ${meanings || '<p class="empty-def">No definition entries found.</p>'}
      <div class="source-link"><a href="${esc(sourceUrl)}" target="_blank" rel="noopener noreferrer">Source: Wiktionary ↗</a></div>
    </article>`;

    $("#b-play").onclick = () => {
      if (entry.audio) new Audio(entry.audio).play().catch(() => speak(entry.word));
      else speak(entry.word);
    };
  }

  function speak(word) {
    if (!("speechSynthesis" in window)) {
      toast("Speech synthesis is not supported in this browser");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  }

  async function lookup(raw) {
    const word = (raw || "").trim().toLowerCase();
    const input = $("#q");
    const main = $("#main-card");

    if (!word) {
      showError("Type a word to search", "Enter an English word in the box above.");
      input?.focus();
      return;
    }

    if (input) input.value = word;
    if (main) main.innerHTML = `<div class="card loading">Looking up “${esc(word)}”…</div>`;

    try {
      renderEntry(await fetchEntry(word));
    } catch (error) {
      if (error.notFound) showError(`No entry for “${word}”`, "Check the spelling or try another word.");
      else showError("Unable to search", "Check your connection and try again.");
    }
  }

  document.addEventListener("click", event => {
    const wordButton = event.target.closest("[data-w]");
    if (wordButton) lookup(wordButton.dataset.w);
  });

  $("#form").addEventListener("submit", event => {
    event.preventDefault();
    lookup($("#q").value);
  });

  $("#themeToggle").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("tala:theme", theme); } catch (_) {}
    applyTheme();
  });

  applyTheme();
})();
