/* ================= State ================= */
const state = {
  /* "mn_lang" is shared with the kanji sister (same web address = same browser
     storage), so the language you pick on either site is the language both
     open in. "lang" stays as a fallback for anyone who chose before that, and
     is kept in step because the account sync still reads it. */
  lang: localStorage.getItem("mn_lang") || localStorage.getItem("lang") || "hy",
  selected: new Set(JSON.parse(localStorage.getItem("selected") || "[]")), // "book|lesson"
  specified: new Set(),   // word ids chosen in "specify" (subset of selected lessons)
  deck: [], index: 0, flipped: false,
  known: new Set(), review: new Set(), deckTitle: "", sourceWords: [],
  favorites: new Set(JSON.parse(localStorage.getItem("favorites") || "[]")),
};

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const t = (k) => (UI[state.lang] && UI[state.lang][k]) || UI.en[k] || k;
const lkey = (b, l) => b + "|" + l;
const wordById = new Map(WORDS.map(w => [w.id, w]));

/* Build the front-of-card markup with real furigana: the small reading sits
   only above the kanji part of the word, not above a trailing hiragana
   ending (e.g. します in 留学します) since that part is already plain kana. */
function frontFurigana(w){
  if(!w.rd) return `<div class="fc-jp-line">${w.jp}</div>`;
  const isHiragana = ch => /[ぁ-んー]/.test(ch);
  let cut = w.jp.length;
  while(cut > 0 && isHiragana(w.jp[cut - 1])) cut--;
  const kanjiPart = w.jp.slice(0, cut);
  const suffix = w.jp.slice(cut);
  if(!kanjiPart) return `<div class="fc-jp-line">${w.jp}</div>`;   // whole word is kana, no furigana needed
  const reading = suffix ? w.rd.slice(0, w.rd.length - suffix.length) : w.rd;
  return `<div class="fc-jp-line"><ruby>${kanjiPart}<rt class="fc-reading">${reading}</rt></ruby>${suffix}</div>`;
}

/* shrink the word on the front of the card just enough to keep it on one
   line, in case the furigana is wide enough to push it past the card edge */
function fitFrontLine(){
  const line = $("#cardFront .fc-jp-line");
  const face = $("#cardFront");
  if(!line || !face) return;
  line.style.fontSize = "";
  const maxWidth = face.clientWidth - 40; // roughly matches the card's own padding
  let size = parseFloat(getComputedStyle(line).fontSize);
  let guard = 30;
  while(line.scrollWidth > maxWidth && size > 18 && guard-- > 0){
    size -= 2;
    line.style.fontSize = size + "px";
  }
}

/* save the in-progress flashcard session so a page refresh doesn't lose it */
function persistSession(){
  const session = JSON.parse(localStorage.getItem("session") || "{}");
  session.view = document.body.dataset.view;
  session.deckIds = state.deck.map(w => w.id);
  session.sourceIds = state.sourceWords.map(w => w.id);
  session.index = state.index;
  session.known = [...state.known];
  session.review = [...state.review];
  session.deckTitle = state.deckTitle;
  localStorage.setItem("session", JSON.stringify(session));
}

/* words present for a given book+lesson */
const hasWords = (b, l) => WORDS.some(w => w.b === b && w.l === l);
const wordsInLesson = (b, l) => WORDS.filter(w => w.b === b && w.l === l);

function selectedWords(){
  const out = [];
  for(const key of state.selected){
    const [b, l] = key.split("|");
    out.push(...wordsInLesson(b, +l));
  }
  return out;
}

/* ================= i18n ================= */
function applyI18n(){
  $$("[data-i18n]").forEach(el => el.textContent = t(el.dataset.i18n));
  $$("[data-i18n-ph]").forEach(el => el.placeholder = t(el.dataset.i18nPh));
  $("#langSelect").value = state.lang;
  document.documentElement.lang = state.lang;   // keep the page's own tag honest
  // refresh dynamic screens that show translations
  if(document.body.dataset.view === "specify") renderSpecify();
  if(document.body.dataset.view === "cards") renderCard();
  if(document.body.dataset.view === "lessons") { renderSingleBooks(); }
  // the quiz options are meanings, so a language switch has to redraw them
  if(document.body.dataset.view === "quiz" && !quiz.locked && quiz.items.length) renderQuestion();
  renderBooks();
  updateActionbar();
}

/* ================= Views + browser history ================= */
function setView(name){
  document.body.dataset.view = name;
  syncActionbarSpace();   // the bar only shows on some views, so re-measure
  window.scrollTo({top:0, behavior:"instant"});
  // remember which screen was open, so a refresh can return to it
  const session = JSON.parse(localStorage.getItem("session") || "{}");
  session.view = name;
  localStorage.setItem("session", JSON.stringify(session));
}
/* go() = navigate AND add a step to browser history, so the back/forward
   arrows move between screens instead of leaving the site. */
function go(name){
  if(document.body.dataset.view !== name){
    history.pushState({view:name}, "");
  }
  setView(name);
}

/* ================= Home: multi-select lesson grid ================= */
function tileEl(b, l){
  const el = document.createElement("button");
  const filled = hasWords(b, l);
  el.className = "tile" + (filled ? "" : " is-empty") + (state.selected.has(lkey(b,l)) ? " is-selected" : "");
  el.dataset.book = b; el.dataset.lesson = l; el.dataset.fill = filled ? "1" : "0";
  const count = filled ? wordsInLesson(b,l).length : 0;
  const label = filled ? `${count} ${count === 1 ? t("word") : t("word_plural")}` : "";
  el.innerHTML = `${l}<small>${label}</small>`;
  return el;
}

function bookBlock(book, single=false){
  const wrap = document.createElement("div");
  wrap.className = "book";
  const activeCount = Array.from({length:book.lessons}, (_,i)=>book.start+i)
    .filter(l => hasWords(book.id, l)).length;
  wrap.innerHTML = `
    <div class="book__head">
      <span class="book__name">${book.name}</span>
      <span class="book__hint">${activeCount ? activeCount + " ready" : "coming soon"}</span>
    </div>`;
  const grid = document.createElement("div");
  grid.className = "lessons-grid";
  for(let i=0;i<book.lessons;i++){
    const l = book.start + i;
    grid.appendChild(tileEl(book.id, l));
  }
  wrap.appendChild(grid);
  return wrap;
}

/* Books grouped under their JLPT level, N5 first. The order inside a level
   just follows the BOOKS array, which already runs Minna then Kirari. */
const LEVELS = ["n5", "n4"];
function booksByLevel(){
  return LEVELS
    .map(lv => ({ level: lv, books: BOOKS.filter(b => b.level === lv) }))
    .filter(g => g.books.length);
}
function levelHead(level){
  const ids = BOOKS.filter(b => b.level === level).map(b => b.id);
  const n = WORDS.filter(w => ids.includes(w.b)).length;
  const h = document.createElement("div");
  h.className = "level-head";
  h.innerHTML = `<span class="level-head__n">${level.toUpperCase()}</span>` +
    `<span class="level-head__c">${n} ${n === 1 ? t("word") : t("word_plural")}</span>`;
  return h;
}
/* one level section: heading, then that level's books */
function levelSection(group, single){
  const sec = document.createElement("section");
  sec.className = "level";
  sec.appendChild(levelHead(group.level));
  group.books.forEach(b => sec.appendChild(bookBlock(b, single)));
  return sec;
}

function renderBooks(){
  const wrap = $("#booksWrap");
  wrap.innerHTML = "";
  booksByLevel().forEach(g => wrap.appendChild(levelSection(g, false)));
  if(!wrap.dataset.dragReady){ enableDragSelect(wrap); wrap.dataset.dragReady = "1"; }
  updateActionbar();
}

/* --- drag to select many tiles (works with mouse & touch) --- */
function enableDragSelect(root){
  let dragging = false, mode = true, touched = new Set();

  const tileAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest(".tile") : null;
  };
  const apply = (tile) => {
    if(!tile || tile.dataset.fill !== "1") return;
    const key = lkey(tile.dataset.book, +tile.dataset.lesson);
    if(touched.has(key)) return;
    touched.add(key);
    if(mode){ state.selected.add(key); tile.classList.add("is-selected"); }
    else    { state.selected.delete(key); tile.classList.remove("is-selected"); }
  };

  root.addEventListener("pointerdown", (e) => {
    const tile = e.target.closest(".tile");
    if(!tile || tile.dataset.fill !== "1") return;
    dragging = true; touched = new Set();
    mode = !state.selected.has(lkey(tile.dataset.book, +tile.dataset.lesson)); // select vs deselect
    apply(tile);
    e.preventDefault();
  });
  document.addEventListener("pointermove", (e) => {
    if(!dragging) return;
    apply(tileAt(e.clientX, e.clientY));
    e.preventDefault();
  }, {passive:false});
  const end = () => {
    if(!dragging) return;
    dragging = false;
    state.specified.clear();               // changing lessons resets word picks
    persist(); updateActionbar();
  };
  document.addEventListener("pointerup", end);
  document.addEventListener("pointercancel", end);
}

/* ================= Action bar ================= */
function updateActionbar(){
  const words = state.specified.size ? [...state.specified] : selectedWords();
  const n = state.specified.size || words.length;
  $("#selCount").textContent = n;
  $("#studyBtn").disabled = n === 0;
  $("#quizBtn").disabled = n < 4;      // four words, four options to choose from
  $("#specifyBtn").disabled = selectedWords().length === 0;
  $("#deselectAllBtn").hidden = state.selected.size === 0 && state.specified.size === 0;
  syncActionbarSpace();
}

/* Reserve exactly as much space at the bottom of the page as the action bar
   actually takes up. A fixed guess went wrong as soon as the bar grew a row
   (or the text wrapped in another language) and it covered the last lesson. */
function syncActionbarSpace(){
  const bar = $("#actionbar");
  const shown = getComputedStyle(bar).display !== "none";
  document.body.style.paddingBottom = shown ? (bar.offsetHeight + 24) + "px" : "16px";
}

/* wipe every lesson/word pick and go back to a blank slate */
function deselectAll(){
  state.selected.clear();
  state.specified.clear();
  persist();
  renderBooks();
  if(document.body.dataset.view === "specify") renderSpecify();
  updateActionbar();
}

/* ================= Specify words ================= */
function renderSpecify(){
  const list = $("#specifyList");
  const q = ($("#wordSearch").value || "").trim().toLowerCase();
  const groups = {};
  selectedWords().forEach(w => {
    const g = w.b + "|" + w.l;
    (groups[g] = groups[g] || []).push(w);
  });
  const keys = Object.keys(groups);
  if(keys.length === 0){
    list.innerHTML = `<p class="empty-note">${t("no_words")}</p>`;
    return;
  }
  list.innerHTML = "";
  keys.forEach(g => {
    const [b, l] = g.split("|");
    const book = BOOKS.find(x=>x.id===b);
    const items = groups[g].filter(w =>
      !q || w.jp.toLowerCase().includes(q) || w.ro.toLowerCase().includes(q) ||
      (w[state.lang]||"").toLowerCase().includes(q) || w.en.toLowerCase().includes(q));
    if(!items.length) return;
    const gr = document.createElement("div");
    gr.className = "specify-group";
    gr.innerHTML = `<h3>${book.name} · ${t("lessons")==="Lessons"?"Lesson":t("lessons")} ${l}</h3>`;
    items.forEach(w => {
      const on = state.specified.has(w.id);
      const row = document.createElement("label");
      row.className = "check-word" + (on ? " is-on" : "");
      row.innerHTML = `
        <input type="checkbox" ${on?"checked":""} data-id="${w.id}">
        <span class="jp">${w.jp}</span>
        <span class="rd">${w.rd}</span>
        <span class="tr">${w[state.lang]}</span>`;
      row.querySelector("input").addEventListener("change", (e) => {
        if(e.target.checked){ state.specified.add(w.id); row.classList.add("is-on"); }
        else { state.specified.delete(w.id); row.classList.remove("is-on"); }
        updateActionbar();
      });
      gr.appendChild(row);
    });
    list.appendChild(gr);
  });
}

/* ================= Single lesson page ================= */
function renderSingleBooks(){
  const wrap = $("#singleBooks");
  wrap.innerHTML = "";
  booksByLevel().forEach(g => {
    const sec = levelSection(g, true);
    // single-select behaviour: tap shows preview
    sec.querySelectorAll(".book").forEach(block => {
      block.querySelectorAll(".tile").forEach(tile => {
        tile.classList.remove("is-selected");
        tile.addEventListener("click", () => {
          if(tile.dataset.fill !== "1") return;
          showLessonPreview(tile.dataset.book, +tile.dataset.lesson, block);
        });
      });
    });
    wrap.appendChild(sec);
  });
  $("#lessonPreview").hidden = true;
}

/* annotate=true marks each word as wrong (bold) or right (dimmed), based on
   how the current/last finished session went — used when jumping in from
   the results screen's "wrong answers by lesson" list */
function showLessonPreview(b, l, block, annotate=false, focusWordId=null){
  $$("#singleBooks .tile").forEach(x=>x.classList.remove("is-selected"));
  block.querySelector(`.tile[data-book="${b}"][data-lesson="${l}"]`).classList.add("is-selected");
  const words = wordsInLesson(b, l);
  const book = BOOKS.find(x=>x.id===b);
  const pv = $("#lessonPreview");
  pv.hidden = false;
  pv.innerHTML = `<h3>${book.name} · ${l}</h3>` +
    words.map(w => {
      const cls = annotate ? (state.review.has(w.id) ? " is-wrong" : state.known.has(w.id) ? " is-dim" : "") : "";
      return `
      <div class="word-row${cls}" data-word-id="${w.id}">
        <span class="jp">${w.jp}</span>
        <span class="rd">${w.rd}</span>
        <span class="tr">${w[state.lang]}</span>
      </div>`;
    }).join("") +
    `<button class="btn btn--primary" style="margin-top:16px;width:100%" id="studyLessonBtn">${t("study_lesson")}</button>`;
  $("#studyLessonBtn").addEventListener("click", () => {
    startDeck(words, `${book.name} · ${l}`);
  });
  if(focusWordId){
    const row = pv.querySelector(`.word-row[data-word-id="${focusWordId}"]`);
    if(row){
      row.classList.add("is-target");
      row.scrollIntoView({behavior:"smooth", block:"center"});
      return;
    }
  }
  pv.scrollIntoView({behavior:"smooth", block:"nearest"});
}

/* jump from the results screen into a lesson's word list, optionally
   scrolling to and highlighting one specific word the user tapped */
function openLessonWords(b, l, annotate, focusWordId=null){
  renderSingleBooks();
  go("lessons");
  const tile = $(`#singleBooks .tile[data-book="${b}"][data-lesson="${l}"]`);
  if(!tile) return;
  showLessonPreview(b, l, tile.closest(".book"), annotate, focusWordId);
}

/* ================= Flashcards ================= */
function startDeck(words, title){
  if(!words.length) return;
  state.deck = words.slice();
  state.sourceWords = words.slice();
  state.deckTitle = title;
  state.index = 0; state.flipped = false;
  state.known = new Set(); state.review = new Set();
  $("#deckTitle").textContent = title;
  showDone(false);
  go("cards");
  renderCard();
}

function renderCard(){
  const w = state.deck[state.index];
  if(!w) return;
  $("#soundBtn").hidden = !canSpeak;
  $("#favBtn").classList.toggle("is-fav", state.favorites.has(w.id));
  const done = state.known.size + state.review.size;
  $("#deckProgress").textContent =
    `${state.index+1} / ${state.deck.length}  ·  ${t("known")} ${state.known.size}  ·  ${t("review")} ${state.review.size}`;
  const fc = $("#flashcard");
  const inner = fc.querySelector(".flashcard__inner");
  // snap the new card to its FRONT with no animation, so you never
  // catch a glimpse of the previous card's back flipping around
  inner.style.transition = "none";
  fc.classList.remove("is-flipped");
  fc.style.transition = "none";
  fc.style.transform = "";
  fc.style.opacity = "1";
  void fc.offsetWidth;              // force the browser to apply it now
  inner.style.transition = "";     // re-enable the flip animation
  state.flipped = false;
  // show the reading as furigana, sitting only above the kanji part
  $("#cardFront").innerHTML = frontFurigana(w);
  fitFrontLine();   // shrink to fit if the furigana makes the line too wide to stay on one line
  // on the back, show kanji only (never hiragana/katakana); katakana/kana-only
  // words show just their meaning + picture
  const hasKanji = /[㐀-䶿一-鿿]/.test(w.jp);
  const subParts = [];
  if(hasKanji) subParts.push(w.jp);
  if(state.lang !== "en" && w.en !== w[state.lang]) subParts.push(w.en);
  const pic = pictureFor(w);
  $("#cardBack").innerHTML = `
    ${pic ? `<div class="fc-pic">${pic}</div>` : ""}
    <div class="fc-mean">${w[state.lang]}</div>
    <div class="fc-mean-sub">${subParts.join(" · ")}</div>`;
  persistSession();
}

/* speak the current card's Japanese word aloud using the browser's built-in voice */
const canSpeak = "speechSynthesis" in window;
function speakJapanese(text){
  if(!canSpeak || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  speechSynthesis.speak(u);
}

function flip(){ state.flipped = !state.flipped; $("#flashcard").classList.toggle("is-flipped", state.flipped); }

/* slide the current card out of the way, swap its content, then slide the new one in */
function advanceCard(newIndex, dir){
  const card = $("#flashcard");
  card.style.transition = "transform .22s ease, opacity .22s ease";
  card.style.transform = `translateX(${dir > 0 ? -50 : 50}px)`;
  card.style.opacity = "0";
  setTimeout(() => {
    state.index = newIndex;
    renderCard();   // snaps new content in place instantly, hidden by the steps below
    card.style.transition = "none";
    card.style.transform = `translateX(${dir > 0 ? 50 : -50}px)`;
    card.style.opacity = "0";
    void card.offsetWidth;   // apply that instantly before animating
    card.style.transition = "transform .22s ease, opacity .22s ease";
    card.style.transform = "translateX(0)";
    card.style.opacity = "1";
  }, 220);
}
function nextCard(){
  if(state.index < state.deck.length-1){ advanceCard(state.index+1, 1); return; }
  const card = $("#flashcard");
  card.style.transition = "transform .2s ease, opacity .2s ease";
  card.style.transform = "translateX(-50px)";
  card.style.opacity = "0";
  setTimeout(finishDeck, 200);   // chart then animates into the card's place
}
function prevCard(){ if(state.index > 0){ advanceCard(state.index-1, -1); } }
function shuffleDeck(){
  for(let i=state.deck.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [state.deck[i],state.deck[j]] = [state.deck[j],state.deck[i]];
  }
  state.index = 0; renderCard();
}

/* mark current card known / review, then move on */
function markCard(isKnown){
  const w = state.deck[state.index];
  if(!w) return;
  if(isKnown){ state.known.add(w.id); state.review.delete(w.id); }
  else { state.review.add(w.id); state.known.delete(w.id); }
  if(state.index < state.deck.length-1){ state.index++; renderCard(); }
  else finishDeck();
}

/* keyboard version of marking known/review: slide the card up (known)
   or down (unknown) so it matches the swipe gesture visually */
function markCardWithSlide(isKnown){
  const w = state.deck[state.index];
  if(!w) return;
  const isLastCard = state.index >= state.deck.length - 1;
  const card = $("#flashcard");
  card.style.transition = "transform .22s ease, opacity .22s ease";
  card.style.transform = `translateY(${isKnown ? -60 : 60}px)`;
  card.style.opacity = "0";
  setTimeout(() => {
    markCard(isKnown);   // updates state; last card triggers finishDeck(), which animates the chart in
    if(isLastCard) return;   // no card left to slide back in — the chart takes its place instead
    card.style.transition = "none";
    card.style.transform = `translateY(${isKnown ? 60 : -60}px)`;
    card.style.opacity = "0";
    void card.offsetWidth;
    card.style.transition = "transform .22s ease, opacity .22s ease";
    card.style.transform = "translateY(0)";
    card.style.opacity = "1";
  }, 220);
}

/* show / hide the end-of-deck screen */
function showDone(on){
  $("#cardZoneStudy").hidden = on;
  const dd = $("#deckDone");
  dd.hidden = !on;
  if(on){
    // restart the entrance animation every time the chart appears
    dd.classList.remove("is-entering");
    void dd.offsetWidth;
    dd.classList.add("is-entering");
  }
}
/* donut chart: hollow-centre ring showing known vs. unknown, with the
   unknown % and count written in the middle */
function buildDonut(unknownCount, total){
  const pct = total ? Math.round((unknownCount / total) * 100) : 0;
  // the ring is sized so 1 unit = 1 screen pixel, letting the labels use the
  // same 12/14/16 type scale as the rest of the app and still sit balanced
  // inside the hole
  const r = 37, c = 2 * Math.PI * r;
  const unknownLen = c * (unknownCount / total);
  const knownLen = c - unknownLen;
  return `
    <svg viewBox="0 0 96 96" width="96" height="96">
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="11"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--good)" stroke-width="11"
        stroke-dasharray="${knownLen} ${c}" transform="rotate(-90 48 48)"/>
      <circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--bad)" stroke-width="11"
        stroke-dasharray="${unknownLen} ${c}" stroke-dashoffset="${-knownLen}" transform="rotate(-90 48 48)"/>
      <text x="48" y="46" text-anchor="middle" class="donut-pct">${pct}%</text>
      <text x="48" y="60" text-anchor="middle" class="donut-pct-label">${unknownCount} / ${total}</text>
    </svg>`;
}

/* reward graphic for a perfect run: sunglasses + スゲー ("awesome") */
function buildSugee(){
  return `
    <div class="sugee">
      <svg viewBox="0 0 100 40" width="80" height="32">
        <rect x="6" y="10" width="34" height="22" rx="6" fill="var(--ink)"/>
        <rect x="60" y="10" width="34" height="22" rx="6" fill="var(--ink)"/>
        <path d="M40 19h20" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
        <path d="M6 16L-2 12M94 16l8-4" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>
      </svg>
      <div class="sugee-text">スゲー</div>
    </div>`;
}

/* tally the review-marked words by lesson, worst lesson first */
function wrongByLesson(){
  const reviewWords = state.sourceWords.filter(w => state.review.has(w.id));
  const tally = new Map();   // "book|lesson" -> {b, l, count, words}
  reviewWords.forEach(w => {
    const key = w.b + "|" + w.l;
    const entry = tally.get(key) || { b: w.b, l: w.l, count: 0, words: [] };
    entry.count++;
    entry.words.push(w);
    tally.set(key, entry);
  });
  return [...tally.values()].sort((a, b) => b.count - a.count);
}

/* One word, one point — ever. Studying the same deck again is good for you but
   it isn't new knowledge, so remember which words have already been paid for
   and only credit the ones that haven't. (The kanji site scores separately, so
   a word known on both sites still counts on both.) */
const SCORED_KEY = "scoredWords";
function loadScoredWords(){
  try { return new Set(JSON.parse(localStorage.getItem(SCORED_KEY) || "[]")); }
  catch(e){ return new Set(); }
}
function creditNewlyKnown(){
  const scored = loadScoredWords();
  let fresh = 0;
  state.known.forEach(id => { if(!scored.has(id)){ scored.add(id); fresh++; } });
  if(fresh){
    try { localStorage.setItem(SCORED_KEY, JSON.stringify([...scored])); } catch(e){}
    if(typeof window.cloudPoints === "function") window.cloudPoints(fresh);
  }
  return fresh;
}

function finishDeck(){
  const total = state.deck.length;
  const unknownCount = total - state.known.size;   // review + anything left unmarked
  // one point per word known, but only the first time that word is known
  creditNewlyKnown();
  if(typeof window.cloudSession === "function") window.cloudSession(state.known.size, total);
  $("#doneTitle").textContent = "";
  $("#doneSub").textContent = "";
  const graphic = $("#doneGraphic");
  if(unknownCount === 0){
    graphic.innerHTML = buildSugee();
  } else {
    const correctPct = Math.round((state.known.size / total) * 100);
    const wrongPct = 100 - correctPct;
    const rows = wrongByLesson();
    graphic.innerHTML = `
      ${buildDonut(unknownCount, total)}
      <div class="done-stats">
        <div class="done-stat"><div class="done-stat__pct">${correctPct}%</div><div class="done-stat__label">${t("correct")}</div></div>
        <div class="done-stat"><div class="done-stat__pct">${wrongPct}%</div><div class="done-stat__label">${t("wrong")}</div></div>
      </div>
      <div class="done-breakdown">
        ${rows.map(r => `<div class="done-breakdown__group">
          <div class="done-breakdown__row">
            <span class="done-breakdown__lesson" data-book="${r.b}" data-lesson="${r.l}">${t("lesson_word")} ${r.l}</span>
            <span class="done-breakdown__count" data-book="${r.b}" data-lesson="${r.l}">${r.count}</span>
          </div>
          <div class="done-breakdown__words">
            ${r.words.map(w => `<span class="done-breakdown__word" data-book="${w.b}" data-lesson="${w.l}" data-word-id="${w.id}">${w.jp}</span>`).join("")}
          </div>
        </div>`).join("")}
      </div>`;
  }
  const rBtn = $("#reviewAgainBtn");
  rBtn.hidden = state.review.size === 0;   // only offer it when there are actual review-marked words
  rBtn.textContent = t("review_again");
  $("#restartBtn").textContent = t("restart");
  showDone(true);
  persistSession();
}

/* ---- swipe gesture on the card (right = known, left = review) ---- */
function enableSwipe(){
  const card = $("#flashcard");
  let sx=0, sy=0, dragging=false, moved=false, decided=false;
  const TH = 90; // pixels to count as a real swipe

  card.addEventListener("pointerdown", e => {
    dragging=true; moved=false; decided=false;
    sx=e.clientX; sy=e.clientY;
    card.style.transition="none";
    card.setPointerCapture(e.pointerId);
  });
  card.addEventListener("pointermove", e => {
    if(!dragging) return;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    if(Math.abs(dx)>6 || Math.abs(dy)>6) moved=true;
    if(Math.abs(dx) < Math.abs(dy)) return; // vertical → let page scroll
    card.style.transform = `translateX(${dx}px) rotate(${dx/22}deg)`;
    $("#badgeKnown").style.opacity = Math.max(0, Math.min(1, dx/TH));
    $("#badgeAgain").style.opacity = Math.max(0, Math.min(1, -dx/TH));
  });
  const release = e => {
    if(!dragging) return;
    dragging=false;
    const dx=e.clientX-sx, dy=e.clientY-sy;
    card.style.transition="transform .28s ease, opacity .28s ease";
    $("#badgeKnown").style.opacity=0; $("#badgeAgain").style.opacity=0;
    if(Math.abs(dx) > TH && Math.abs(dx) > Math.abs(dy)){
      const known = dx > 0;
      card.style.transform = `translateX(${known?520:-520}px) rotate(${known?24:-24}deg)`;
      card.style.opacity = "0";
      setTimeout(() => markCard(known), 220);
    } else {
      card.style.transform = "";
      if(!moved) flip(); // it was a tap, not a swipe
    }
  };
  card.addEventListener("pointerup", release);
  card.addEventListener("pointercancel", () => { dragging=false; card.style.transform=""; $("#badgeKnown").style.opacity=0; $("#badgeAgain").style.opacity=0; });
}

/* ================= Sister-site switch =================
   Play the flower swap first, then leave. The other site plays the matching
   arrival, so the two halves read as one motion across the hand-off. A
   sessionStorage flag carries that intent; it survives the navigation but not
   a new tab, which is exactly the scope we want. */
function initSiteSwitch(){
  const box = $("#siteSwitch");
  const link = $("#goKanji");
  if(!box || !link) return;

  /* The language needs no hand-off here: both sites read the same shared
     "mn_lang" setting, so the sister already opens in the right language. */
  if(sessionStorage.getItem("cameFromSister")){
    sessionStorage.removeItem("cameFromSister");
    box.classList.add("is-arriving");
    setTimeout(() => box.classList.remove("is-arriving"), 500);
  }

  link.addEventListener("click", (e) => {
    if(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;  // let people open a new tab
    e.preventDefault();
    const go = () => { sessionStorage.setItem("cameFromSister", "1"); location.href = link.href; };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){ go(); return; }
    box.classList.add("is-swapping");
    setTimeout(go, 300);            // just under the .34s swap, so it never stalls
  });
}

/* ================= Theme =================
   Dark is the only theme now. Anyone who had picked light before still has
   "light" sitting in their browser storage, so clear it rather than let a
   stale value linger. */
function applyTheme(){
  document.documentElement.setAttribute("data-theme", "dark");
  localStorage.removeItem("theme");
}

/* ================= Persist ================= */
function persist(){
  localStorage.setItem("lang", state.lang);
  localStorage.setItem("mn_lang", state.lang);   // the kanji sister reads this one
  localStorage.setItem("selected", JSON.stringify([...state.selected]));
  localStorage.setItem("favorites", JSON.stringify([...state.favorites]));
  // if someone is signed in, cloud.js mirrors this up to their account
  if(typeof window.cloudPush === "function") window.cloudPush();
}

/* cloud.js calls this after pulling an account's saved words down, so the
   screen shows them without needing a reload. */
window.reloadFromCloud = function(){
  // the shared setting first, same as at startup — otherwise a sync from the
  // account would quietly undo a language just picked on the sister site
  state.lang = localStorage.getItem("mn_lang") || localStorage.getItem("lang") || state.lang;
  state.selected  = new Set(JSON.parse(localStorage.getItem("selected")  || "[]"));
  state.favorites = new Set(JSON.parse(localStorage.getItem("favorites") || "[]"));
  applyI18n();
};

/* ================= Quiz =================
   The same words as the flashcards, played instead of flipped: the Japanese
   on top, four meanings below, one of them right. Nothing is written back to
   the deck — a game shouldn't decide what you "know". */
const quiz = { items: [], pool: [], index: 0, score: 0, wrong: [], locked: false };

const quizMeaning = (w) => (w[state.lang] || w.en || "").trim();

function shuffledCopy(arr){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* decoyFrom: where the wrong options come from. A replay round has only the
   missed words left, so its decoys keep coming from the whole original deck. */
/* Each word only once. The same word appears in more than one lesson, so
   picking two lessons can hand us the same word twice — and being asked it
   twice in one round feels broken. */
function quizPool(words){
  const seen = new Set();
  return (words || []).filter(w => {
    if(!w || !quizMeaning(w) || !w.jp) return false;
    if(seen.has(w.jp)) return false;
    seen.add(w.jp);
    return true;
  });
}

function startQuiz(words, decoyFrom){
  const asked = quizPool(words);
  const pool  = quizPool(decoyFrom || words);
  // the Quiz button is already disabled below four words; this is the backstop
  if(!asked.length || pool.length < 4) return;
  quiz.items = shuffledCopy(asked);
  quiz.pool = pool;
  quiz.index = 0; quiz.score = 0; quiz.wrong = []; quiz.locked = false;
  $("#quizDone").hidden = true;
  $("#quizPlay").hidden = false;
  go("quiz");
  renderQuestion();
}

function renderQuestion(){
  const w = quiz.items[quiz.index];
  if(!w) return;
  quiz.locked = false;
  $("#quizProgress").textContent = `${quiz.index + 1} / ${quiz.items.length}`;
  $("#quizWord").innerHTML = `<span lang="ja">${w.jp}</span>`;

  const right = quizMeaning(w);
  const seen = new Set([right]);
  const decoys = [];
  for(const d of shuffledCopy(quiz.pool)){
    if(decoys.length === 3) break;
    const m = quizMeaning(d);
    if(seen.has(m)) continue;
    seen.add(m);
    decoys.push(m);
  }
  const box = $("#quizOptions");
  box.innerHTML = "";
  shuffledCopy([right, ...decoys]).forEach(text => {
    const b = document.createElement("button");
    b.className = "quiz-opt";
    b.type = "button";
    b.textContent = text;
    b.addEventListener("click", () => answerQuiz(b, text === right, right));
    box.appendChild(b);
  });
}

function answerQuiz(btn, isRight, right){
  if(quiz.locked) return;
  quiz.locked = true;
  const opts = $$(".quiz-opt");
  opts.forEach(b => { b.disabled = true; });
  if(isRight){
    quiz.score++;
    btn.classList.add("is-right");
  } else {
    quiz.wrong.push(quiz.items[quiz.index]);
    btn.classList.add("is-wrong");
    // show which one it should have been, so a miss still teaches something
    const good = opts.find(b => b.textContent === right);
    if(good) good.classList.add("is-right");
  }
  setTimeout(() => {
    if(quiz.index < quiz.items.length - 1){ quiz.index++; renderQuestion(); }
    else finishQuiz();
  }, isRight ? 650 : 1400);
}

function finishQuiz(){
  $("#quizPlay").hidden = true;
  const done = $("#quizDone");
  done.hidden = false;
  done.classList.remove("is-entering");
  void done.offsetWidth;
  done.classList.add("is-entering");

  const total = quiz.items.length;
  const missed = total - quiz.score;
  const graphic = $("#quizGraphic");
  if(missed === 0){
    graphic.innerHTML = buildSugee();
  } else {
    const rightPct = Math.round((quiz.score / total) * 100);
    graphic.innerHTML = `
      ${buildDonut(missed, total)}
      <div class="done-stats">
        <div class="done-stat"><div class="done-stat__pct">${rightPct}%</div><div class="done-stat__label">${t("correct")}</div></div>
        <div class="done-stat"><div class="done-stat__pct">${100 - rightPct}%</div><div class="done-stat__label">${t("wrong")}</div></div>
      </div>
      <p class="quiz-ask">${quiz.score} ${t("quiz_score")} ${total}</p>`;
  }
  const again = $("#quizAgainBtn");
  again.hidden = quiz.wrong.length === 0;
  again.textContent = `${t("quiz_again")} (${quiz.wrong.length})`;
  $("#quizRestartBtn").textContent = t("restart");
}

/* bring back an in-progress flashcard session after a page refresh.
   Returns true if a session was actually restored. */
function restoreSession(){
  let session;
  try { session = JSON.parse(localStorage.getItem("session") || "null"); }
  catch(e){ session = null; }
  if(!session || session.view !== "cards" || !Array.isArray(session.deckIds) || !session.deckIds.length) return false;

  const deck = session.deckIds.map(id => wordById.get(id)).filter(Boolean);
  if(!deck.length) return false;
  const sourceWords = (session.sourceIds || []).map(id => wordById.get(id)).filter(Boolean);

  state.deck = deck;
  state.sourceWords = sourceWords.length ? sourceWords : deck.slice();
  state.index = Math.min(Math.max(session.index || 0, 0), deck.length - 1);
  state.known = new Set(session.known || []);
  state.review = new Set(session.review || []);
  state.deckTitle = session.deckTitle || t("flashcards");
  $("#deckTitle").textContent = state.deckTitle;
  document.body.dataset.view = "cards";

  if(state.known.size + state.review.size >= state.deck.length) finishDeck();
  else { showDone(false); renderCard(); }
  return true;
}

/* ================= Wire up ================= */
function init(){
  applyTheme();
  initSiteSwitch();
  renderBooks();
  applyI18n();
  const restored = restoreSession();   // put a refreshed page back where it left off
  history.replaceState({view: restored ? "cards" : "home"}, ""); // first history step
  window.addEventListener("popstate", e => setView((e.state && e.state.view) || "home"));

  $("#langSelect").addEventListener("change", e => { state.lang = e.target.value; persist(); applyI18n(); });
  $("#brandBtn").addEventListener("click", () => go("home"));

  $("#navFlashcards").addEventListener("click", () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    if(!words.length){ go("home"); return; }
    startDeck(words, t("flashcards"));
  });
  $("#navLessons").addEventListener("click", () => { renderSingleBooks(); go("lessons"); });

  $("#studyBtn").addEventListener("click", () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    startDeck(words, t("flashcards"));
  });
  $("#specifyBtn").addEventListener("click", () => { renderSpecify(); go("specify"); });
  $("#quizBtn").addEventListener("click", () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    startQuiz(words);
  });
  $("#quizAgainBtn").addEventListener("click", () => startQuiz(quiz.wrong.slice(), quiz.pool));
  $("#quizRestartBtn").addEventListener("click", () => startQuiz(quiz.pool.slice()));
  $("#deselectAllBtn").addEventListener("click", deselectAll);
  window.addEventListener("resize", syncActionbarSpace);   // bar height changes with width
  /* Re-measure whenever the bar itself changes height. Measuring only at
     startup left the gap a few pixels short once the web fonts arrived and
     nudged the bar taller, which hid the word count on the very last tile. */
  if(window.ResizeObserver) new ResizeObserver(syncActionbarSpace).observe($("#actionbar"));
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(syncActionbarSpace);

  $$("[data-goto]").forEach(b => b.addEventListener("click", () => history.back()));

  $("#wordSearch").addEventListener("input", renderSpecify);
  $("#selectAllWords").addEventListener("click", () => {
    selectedWords().forEach(w => state.specified.add(w.id)); renderSpecify(); updateActionbar();
  });
  $("#clearWords").addEventListener("click", () => { state.specified.clear(); renderSpecify(); updateActionbar(); });

  // flashcard controls
  enableSwipe();
  $("#flipBtn").addEventListener("click", flip);
  $("#soundBtn").addEventListener("click", () => {
    const w = state.deck[state.index];
    if(w) speakJapanese(w.jp);
  });
  // the star sits inside the flashcard, so stop its taps from also
  // triggering the card's own tap-to-flip / swipe behavior
  $("#favBtn").addEventListener("pointerdown", e => e.stopPropagation());
  $("#favBtn").addEventListener("click", () => {
    const w = state.deck[state.index];
    if(!w) return;
    if(state.favorites.has(w.id)) state.favorites.delete(w.id);
    else state.favorites.add(w.id);
    persist();
    $("#favBtn").classList.toggle("is-fav", state.favorites.has(w.id));
  });
  $("#nextBtn").addEventListener("click", nextCard);
  $("#prevBtn").addEventListener("click", prevCard);
  // results screen: tap a lesson's count to see its words, tap the lesson
  // name to see that same lesson with wrong/right answers marked
  $("#doneGraphic").addEventListener("click", e => {
    const wordEl = e.target.closest(".done-breakdown__word");
    if(wordEl){
      openLessonWords(wordEl.dataset.book, +wordEl.dataset.lesson, true, wordEl.dataset.wordId);
      return;
    }
    const lessonEl = e.target.closest(".done-breakdown__lesson");
    const countEl = e.target.closest(".done-breakdown__count");
    const hit = lessonEl || countEl;
    if(!hit) return;
    openLessonWords(hit.dataset.book, +hit.dataset.lesson, !!lessonEl);
  });
  $("#shuffleBtn").addEventListener("click", shuffleDeck);
  $("#reviewAgainBtn").addEventListener("click", () => {
    const reviewWords = state.sourceWords.filter(w => state.review.has(w.id));
    startDeck(reviewWords, t("review"));
  });
  $("#restartBtn").addEventListener("click", () => startDeck(state.sourceWords, state.deckTitle));
  document.addEventListener("keydown", e => {
    if(document.body.dataset.view !== "cards") return;
    if(e.key === "ArrowRight") nextCard();
    if(e.key === "ArrowLeft") prevCard();
    if(e.key === "ArrowUp"){ e.preventDefault(); markCardWithSlide(true); }
    if(e.key === "ArrowDown"){ e.preventDefault(); markCardWithSlide(false); }
    if(e.key === " " || e.key === "Enter"){ e.preventDefault(); flip(); }
  });
}

document.addEventListener("DOMContentLoaded", init);
