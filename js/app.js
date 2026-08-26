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
  logged: false,          // this deck has already been written to the history
  historyId: "",          // the history entry this deck is keeping up to date
  favorites: new Set(JSON.parse(localStorage.getItem("favorites") || "[]")),
};

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

const t = (k) => (UI[state.lang] && UI[state.lang][k]) || UI.en[k] || k;
const lkey = (b, l) => b + "|" + l;
const wordById = new Map(WORDS.map(w => [w.id, w]));

/* ===== Furigana =====
   Put each slice of the reading over the kanji it actually belongs to, and
   leave the kana that is already written in the word bare: お金 → お金(かね),
   食べます → 食(た)べます, 申し込みます → 申(もう)し込(こ)みます.

   The kana already visible in the word are the anchors: they must appear in
   the reading in the same order, so whatever sits between two anchors is the
   reading of the kanji between them. If the two ever disagree (a wrong or
   irregular reading), we fall back to one ruby over the whole word rather
   than guessing. */
const isKana = ch => /[ぁ-んァ-ヶー]/.test(ch);
/* Anything that is spelled one way and read another, so it needs a reading on
   top: kanji, and digits — 2分の1 is read にぶんのいち. */
const isKanji = ch => /[々㐀-䶿一-鿿0-9０-９]/.test(ch);
const isPlaceholder = txt => /[~～]/.test(txt);
const toHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

/* Cut the word into pieces the aligner can reason about: runs of kana, runs
   of kanji, and "notes" — the extras a few entries carry, like the (する) in
   運動(する), the [な] in 元気[な] or the ・ in 水泳・泳ぎます. A note may or
   may not show up in the reading too, so it is matched loosely. A bracket
   whose inside has kanji (起きます(起きる)) is not a note: the inside is a
   word in its own right and gets furigana like any other. */
function splitRuns(jp){
  const runs = [];
  const push = (type, ch) => {
    const last = runs[runs.length - 1];
    if(last && last.type === type && type !== "note") last.text += ch;
    else runs.push({ type, text: ch });
  };
  for(let i = 0; i < jp.length; i++){
    const ch = jp[i];
    const close = { "(": ")", "（": "）", "[": "]", "［": "］" }[ch];
    if(close){
      const end = jp.indexOf(close, i + 1);
      const inside = end > 0 ? jp.slice(i + 1, end) : "";
      if(end > 0 && ![...inside].some(isKanji)){
        runs.push({ type: "note", text: jp.slice(i, end + 1) });
        i = end;
        continue;
      }
    }
    push(isKana(ch) ? "kana" : isKanji(ch) ? "kanji" : "note", ch);
  }
  /* "~を卒業する" is read そつぎょうする: the particle belongs to the ~ stand-in
     for the missing word, not to the word being read, so it may be absent. */
  runs.forEach((run, i) => {
    const before = runs[i - 1];
    if(run.type === "kana" && before && before.type === "note" && isPlaceholder(before.text)){
      run.optional = true;
    }
  });
  return runs;
}

/* → [{text, reading}] where reading is "" for parts that need no furigana,
   or null when the word and its reading can't be lined up.
   Kanji lengths are tried shortest-first with backtracking, so 五つ lands on
   五(いつ)つ rather than stopping at the first つ it sees. */
function furiganaParts(jp, rd){
  if(!rd || toHira(rd) === toHira(jp)) return [{ text: jp, reading: "" }];
  const runs = splitRuns(jp);
  const reading = toHira(rd);

  const walk = (i, pos) => {
    if(i === runs.length) return pos === reading.length ? [] : null;
    const run = runs[i];
    const bare = rest => rest && [{ text: run.text, reading: "" }, ...rest];

    if(run.type === "kana"){
      const kana = toHira(run.text);
      if(reading.startsWith(kana, pos)){
        const taken = bare(walk(i + 1, pos + kana.length));
        if(taken) return taken;
      } else if(!run.optional){
        return null;                    // plain kana must be in the reading
      }
      return run.optional ? bare(walk(i + 1, pos)) : null;
    }

    if(run.type === "note"){
      // the reading may spell the note out too (・, (を)), or leave it out entirely
      const spoken = toHira(run.text).replace(/[^ぁ-んー]/g, "");
      for(const guess of [toHira(run.text), spoken, ""]){
        if(guess && !reading.startsWith(guess, pos)) continue;
        const rest = bare(walk(i + 1, pos + guess.length));
        if(rest) return rest;
      }
      return null;
    }

    for(let end = pos + 1; end <= reading.length; end++){
      if(!isKana(reading[end - 1])) break;   // a kanji is read as kana, never as ・ or ~
      const rest = walk(i + 1, end);
      if(rest) return [{ text: run.text, reading: rd.slice(pos, end) }, ...rest];
    }
    return null;
  };
  return walk(0, 0);
}

/* Word with its furigana as HTML. Falls back to a single ruby over the kanji
   when the reading can't be lined up piece by piece. */
function furiganaHTML(w, rtClass){
  const rt = txt => `<rt class="${rtClass}">${txt}</rt>`;
  const parts = furiganaParts(w.jp, w.rd);
  if(parts){
    return parts.map(p => p.reading ? `<ruby>${p.text}${rt(p.reading)}</ruby>` : p.text).join("");
  }
  return `<ruby>${w.jp}${rt(w.rd)}</ruby>`;
}

function frontFurigana(w){
  return `<div class="fc-jp-line">${furiganaHTML(w, "fc-reading")}</div>`;
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
  session.logged = state.logged;
  session.historyId = state.historyId;
  localStorage.setItem("session", JSON.stringify(session));
  // keep this deck's history entry in step, so leaving now loses nothing
  if(!state.logged){
    updateSession(state.historyId, {
      total: state.deck.length,
      known: state.known.size,
      unknown: state.review.size,
      resume: {
        deckIds: session.deckIds, sourceIds: session.sourceIds,
        index: state.index, known: session.known, review: session.review,
        deckTitle: state.deckTitle,
      },
    });
  }
}

/* ===== The quiz survives a refresh too =====
   The cards have been saved since day one; a quiz was not, so reloading
   mid-game dropped you on the home screen with the score gone. Everything
   needed to redraw the game is written down: which words are being asked, how
   far in you are, the score, and the four options each question was given
   (so stepping back shows the answers you actually saw, not a fresh shuffle). */
const QUIZ_KEY = "quizSession";
function persistQuiz(){
  if(!quiz.items.length){ localStorage.removeItem(QUIZ_KEY); return; }
  const snap = {
    itemIds: quiz.items.map(w => w.id),
    poolIds: quiz.pool.map(w => w.id),
    index: quiz.index, view: quiz.view, score: quiz.score,
    wrongIds: quiz.wrong.map(w => w.id),
    rounds: quiz.rounds.map(r => r ? { options: r.options, right: r.right, picked: r.picked } : null),
    done: !$("#quizDone").hidden,
    logged: quiz.logged,
    historyId: quiz.historyId,
  };
  try { localStorage.setItem(QUIZ_KEY, JSON.stringify(snap)); } catch(e){}
  // a game walked away from is still a game you can come back to
  if(!quiz.logged){
    const answered = quiz.rounds.filter(r => r && r.picked !== null).length;
    updateSession(quiz.historyId, {
      total: quiz.items.length, known: quiz.score,
      unknown: Math.max(0, answered - quiz.score),
      resume: snap,
    });
  }
}

/* Put a refreshed page back into the game. Returns true if it did. */
function restoreQuiz(){
  let s;
  try { s = JSON.parse(localStorage.getItem(QUIZ_KEY) || "null"); }
  catch(e){ return false; }
  if(!s || !Array.isArray(s.itemIds) || !s.itemIds.length) return false;

  const items = s.itemIds.map(id => wordById.get(id)).filter(Boolean);
  if(items.length !== s.itemIds.length) return false;   // the word list moved under us

  quiz.items  = items;
  quiz.pool   = (s.poolIds || []).map(id => wordById.get(id)).filter(Boolean);
  quiz.index  = Math.min(Math.max(s.index || 0, 0), items.length - 1);
  quiz.score  = s.score || 0;
  quiz.wrong  = (s.wrongIds || []).map(id => wordById.get(id)).filter(Boolean);
  quiz.rounds = Array.isArray(s.rounds) ? s.rounds.slice() : [];
  quiz.locked = false;
  quiz.logged = !!s.logged;
  quiz.historyId = s.historyId || "";

  // refreshed in the beat between answering and the next question: move on,
  // otherwise you come back to a question that can no longer be answered
  let done = !!s.done;
  const current = quiz.rounds[quiz.index];
  if(current && current.picked !== null){
    if(quiz.index < quiz.items.length - 1) quiz.index++;
    else done = true;
  }
  document.body.dataset.view = "quiz";
  if(done){ $("#quizPlay").hidden = true; finishQuiz(); }
  else { $("#quizDone").hidden = true; $("#quizPlay").hidden = false; renderQuestion(); }
  return true;
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
  fullLabels();
  $("#langSelect").value = state.lang;
  document.documentElement.lang = state.lang;   // keep the page's own tag honest
  // refresh dynamic screens that show translations
  if(document.body.dataset.view === "specify") renderSpecify();
  if(document.body.dataset.view === "cards") renderCard();
  if(document.body.dataset.view === "lessons") { renderSingleBooks(); }
  if(document.body.dataset.view === "history") renderHistory();   // dates and labels are translated
  // the quiz options are meanings, so a language switch has to redraw them
  if(document.body.dataset.view === "quiz" && !quiz.locked && quiz.items.length) renderQuestion();
  renderBooks();
  updateActionbar();
}

/* A short message that fades away — the app had no way of saying anything, so
   a button that could not act just did nothing, which reads as broken. */
let toastTimer = null;
function toast(text){
  let box = $("#toast");
  if(!box){
    box = document.createElement("div");
    box.id = "toast";
    box.className = "toast";
    document.body.appendChild(box);
  }
  box.textContent = text;
  box.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("is-on"), 2600);
}

/* ================= Full screen =================
   The cards can take over the whole screen. We ask the browser for real full
   screen where that is allowed, and either way blow the deck up to fill the
   window ourselves — so it works on iPhones too, which have no such API.
   The ✕ in the corner brings the cards back into the window. */
function inNativeFull(){ return document.fullscreenElement || document.webkitFullscreenElement || null; }
/* Safari's address bar and toolbar sit *over* the page, so "the whole screen"
   is taller than what you can actually see. Measure the visible strip and hand
   it to the CSS, or the deck's top and bottom hide behind those bars. */
function syncFsViewport(){
  const root = document.documentElement.style;
  if(!document.body.classList.contains("is-fullscreen")){
    root.removeProperty("--fs-h"); root.removeProperty("--fs-top"); return;
  }
  const vv = window.visualViewport;
  root.setProperty("--fs-h", (vv ? vv.height : window.innerHeight) + "px");
  root.setProperty("--fs-top", (vv ? vv.offsetTop : 0) + "px");
}
if(window.visualViewport){
  window.visualViewport.addEventListener("resize", syncFsViewport);
  window.visualViewport.addEventListener("scroll", syncFsViewport);
}
window.addEventListener("resize", syncFsViewport);
window.addEventListener("orientationchange", () => setTimeout(syncFsViewport, 300));
function fullLabels(){
  const on = document.body.classList.contains("is-fullscreen");
  const txt = t(on ? "exit_full" : "full_screen");
  ["#fsCards","#fsQuiz"].forEach(sel => {
    const b = $(sel);
    if(b){ b.title = txt; b.setAttribute("aria-label", txt); }
  });
}
function enterFull(){
  document.body.classList.add("is-fullscreen");
  fullLabels();
  const el = document.documentElement;
  const ask = el.requestFullscreen || el.webkitRequestFullscreen;
  if(ask){ try { const p = ask.call(el); if(p && p.catch) p.catch(() => {}); } catch(e){} }
  window.scrollTo(0, 0);
  syncFsViewport();
  setTimeout(syncFsViewport, 250);   // again once the browser's bars settle
}
function leaveFull(){
  document.body.classList.remove("is-fullscreen");
  fullLabels();
  syncFsViewport();
  const drop = document.exitFullscreen || document.webkitExitFullscreen;
  if(inNativeFull() && drop){ try { const p = drop.call(document); if(p && p.catch) p.catch(() => {}); } catch(e){} }
}
function toggleFull(){ document.body.classList.contains("is-fullscreen") ? leaveFull() : enterFull(); }

/* ================= Views + browser history ================= */
function setView(name){
  document.body.dataset.view = name;
  if(name !== "cards" && name !== "quiz") leaveFull();   // full screen is for the cards only
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
  state.logged = false;
  state.historyId = newSession("cards", wordsLabel(words), words.length);
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
  if(isKnown){ state.known.add(w.id); state.review.delete(w.id); creditWord(w.id); }
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

/* ================= History =================
   Every deck and every quiz you finish is written down twice: here on the
   device, so it is there whether or not you have an account, and — when you
   are signed in — into `study_sessions`, the table the kanji site already
   writes its own sessions to. The history screen puts the two together. */
const HISTORY_KEY = "mn_history";
const HISTORY_MAX = 300;

function loadLocalHistory(){
  try {
    const rows = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(rows) ? rows : [];
  } catch(e){ return []; }
}

/* Name a session after the lessons it came from — "Քարտեր" told you nothing
   a week later. */
function wordsLabel(words){
  const byBook = new Map();
  (words || []).forEach(w => {
    if(!byBook.has(w.b)) byBook.set(w.b, new Set());
    byBook.get(w.b).add(w.l);
  });
  const parts = [];
  for(const [bookId, lessons] of byBook){
    const book = BOOKS.find(x => x.id === bookId);
    const ls = [...lessons].sort((a, b) => a - b);
    const shown = ls.slice(0, 4).join(", ") + (ls.length > 4 ? "…" : "");
    parts.push(`${book ? book.name : bookId} · ${t("lesson_word")} ${shown}`);
  }
  return parts.join(" + ") || t("flashcards");
}

function saveLocalHistory(rows){
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(rows.slice(0, HISTORY_MAX))); } catch(e){}
}

/* A session joins the history the moment it starts, not when it ends — a deck
   you put down half-way is exactly the one you want to find again. Each entry
   keeps its own place (`resume`), so picking it up later carries on from the
   card or question you stopped at instead of starting over. Finishing it
   clears that place and marks it done. */
let historySeq = 0;
function newSession(kind, title, total){
  const id = "s" + Date.now().toString(36) + (historySeq++).toString(36);
  const rows = loadLocalHistory();
  rows.unshift({ at: new Date().toISOString(), id, kind, title,
                 total, known: 0, unknown: 0, done: false, resume: null });
  saveLocalHistory(rows);
  return id;
}

/* Called on every swipe and every answer: cheap, and it means the history is
   never more than one card behind what you actually did. */
function updateSession(id, patch){
  if(!id) return;
  const rows = loadLocalHistory();
  const entry = rows.find(r => r.id === id);
  if(!entry) return;
  Object.assign(entry, patch, { at: new Date().toISOString() });
  saveLocalHistory(rows);
}

function finishSession(id, title, total, known){
  updateSession(id, { title, total, known, unknown: Math.max(0, total - known),
                      done: true, resume: null });
  if(typeof window.cloudSession === "function"){
    window.cloudSession({ set_name: title, total, known, skipped: 0 });
  }
}

/* The entry you tapped "continue" on, put back into play. */
function resumeSession(id){
  const entry = loadLocalHistory().find(r => r.id === id);
  if(!entry || !entry.resume) return false;
  const r = entry.resume;

  if(entry.kind === "quiz"){
    const items = (r.itemIds || []).map(i => wordById.get(i)).filter(Boolean);
    if(!items.length) return false;
    quiz.items = items;
    quiz.pool = (r.poolIds || []).map(i => wordById.get(i)).filter(Boolean);
    quiz.index = Math.min(Math.max(r.index || 0, 0), items.length - 1);
    quiz.score = r.score || 0;
    quiz.wrong = (r.wrongIds || []).map(i => wordById.get(i)).filter(Boolean);
    quiz.rounds = Array.isArray(r.rounds) ? r.rounds.slice() : [];
    quiz.locked = false;
    quiz.logged = false;
    quiz.historyId = id;
    $("#quizDone").hidden = true;
    $("#quizPlay").hidden = false;
    go("quiz");
    renderQuestion();
    return true;
  }

  const deck = (r.deckIds || []).map(i => wordById.get(i)).filter(Boolean);
  if(!deck.length) return false;
  const source = (r.sourceIds || []).map(i => wordById.get(i)).filter(Boolean);
  state.deck = deck;
  state.sourceWords = source.length ? source : deck.slice();
  state.index = Math.min(Math.max(r.index || 0, 0), deck.length - 1);
  state.known = new Set(r.known || []);
  state.review = new Set(r.review || []);
  state.deckTitle = r.deckTitle || entry.title;
  state.flipped = false;
  state.logged = false;
  state.historyId = id;
  $("#deckTitle").textContent = state.deckTitle;
  showDone(false);
  go("cards");
  renderCard();
  persistSession();
  return true;
}

/* One word, counted once — ever. Studying the same deck again is good for you
   but it isn't new knowledge, so this list remembers every word you have ever
   marked known. What each one is WORTH is decided in cloud.js by its level:
   an N4 word counts double an N5 one. (The kanji site scores separately, so a
   word known on both sites still counts on both.) */
const SCORED_KEY = "scoredWords";
function loadScoredWords(){
  try { return new Set(JSON.parse(localStorage.getItem(SCORED_KEY) || "[]")); }
  catch(e){ return new Set(); }
}
function saveScoredWords(scored){
  try { localStorage.setItem(SCORED_KEY, JSON.stringify([...scored])); } catch(e){}
  // cloud.js debounces both of these, so swiping fast is still one write
  if(typeof window.cloudPoints === "function") window.cloudPoints();
  if(typeof window.cloudPush === "function") window.cloudPush();
}

/* Credit a word the moment you swipe it, not at the end of the deck. A deck
   can be hundreds of words long and is often put down half-way; crediting
   only on the very last card threw away every session that never reached it.
   Swiping a word you already know again costs nothing — the list above is
   what stops it counting twice. */
function creditWord(id){
  const scored = loadScoredWords();
  if(scored.has(id)) return;
  scored.add(id);
  saveScoredWords(scored);
}

/* belt and braces: catches anything marked before this ran (a session
   restored from a refresh, say) when the deck does reach its end */
function creditNewlyKnown(){
  const scored = loadScoredWords();
  let fresh = 0;
  state.known.forEach(id => { if(!scored.has(id)){ scored.add(id); fresh++; } });
  if(fresh) saveScoredWords(scored);
  return fresh;
}

function finishDeck(){
  const total = state.deck.length;
  const unknownCount = total - state.known.size;   // review + anything left unmarked
  // one point per word known, but only the first time that word is known
  creditNewlyKnown();
  // written down once: a refresh on the results screen calls this again
  if(!state.logged){
    state.logged = true;
    finishSession(state.historyId, wordsLabel(state.deck), total, state.known.size);
  }
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

/* ================= History screen =================
   Two sources, one list. This device always has its own log; an account adds
   everything done on other devices AND everything done next door on the kanji
   site, which writes to the same table. A session logged in both places shows
   up once — same site, same name, same score, same minute is the same run. */
/* Full locale tags: "hy" alone leaves some browsers on their own default,
   and all three audiences read a 24-hour clock. */
const DATE_LOCALE = { en: "en-GB", ru: "ru-RU", hy: "hy-AM" };
const histLocale = () => DATE_LOCALE[state.lang] || "en-GB";

const escHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function mergeHistory(cloudRows){
  const local = loadLocalHistory().map(r => ({
    at: r.at, site: "vocab", kind: r.kind, title: r.title,
    total: r.total || 0, known: r.known || 0,
    done: r.done !== false, id: r.id || "", canResume: !!(r.resume && r.id),
  }));
  // the kanji site inserts its rows without an `app`, ours are stamped "vocab".
  // Anything that reached the cloud is by definition a session that finished.
  const remote = (cloudRows || []).map(r => ({
    at: r.created_at, site: r.app === "vocab" ? "vocab" : "kanji", kind: null,
    title: r.set_name || "", total: r.total || 0, known: r.known || 0,
    done: true, id: "", canResume: false,
  }));

  const seen = new Set();
  const rows = [];
  for(const r of [...local, ...remote]){
    const when = new Date(r.at).getTime();
    if(!when) continue;
    const key = [r.site, r.done, r.title, r.total, r.known, Math.floor(when / 60000)].join("|");
    if(seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
  }
  return rows.sort((a, b) => new Date(b.at) - new Date(a.at));
}

function historyRowHTML(r){
  const pct = r.total ? Math.round((r.known / r.total) * 100) : 0;
  const time = new Date(r.at).toLocaleTimeString(histLocale(),
    { hour: "2-digit", minute: "2-digit", hour12: false });
  const what = r.kind === "quiz" ? t("quiz_btn") : r.kind === "cards" ? t("flashcards") : "";
  const site = r.site === "kanji" ? t("site_kanji") : t("site_vocab");
  const sub = [time, what, r.done ? "" : t("history_unfinished")].filter(Boolean).join(" · ");
  /* A session you can pick up again is the whole row, not a button squeezed
     into it: a bigger target, and one less style competing with the diamonds
     the rest of the app is built from. */
  const open = r.canResume;
  return `<li class="hist-row${r.done ? "" : " hist-row--open"}"
    ${open ? `data-resume="${escHtml(r.id)}" role="button" tabindex="0"` : ""}>
    <span class="hist-row__site hist-row__site--${r.site}">${site}</span>
    <div class="hist-row__body">
      <p class="hist-row__title">${escHtml(r.title) || site}</p>
      <p class="hist-row__sub">${sub}</p>
    </div>
    <div class="hist-row__score">
      <span class="hist-row__count">${r.known}/${r.total}</span>
      <span class="hist-bar"><i style="width:${pct}%"></i></span>
    </div>
    ${open ? `<span class="hist-row__go">${t("history_continue")} →</span>` : ""}
  </li>`;
}

function paintHistory(rows, signedIn){
  const box = $("#historyList");
  const note = $("#historyNote");
  note.textContent = signedIn ? "" : t("history_signin");
  note.hidden = !note.textContent;

  if(!rows.length){
    box.innerHTML = `<p class="hist-empty">${t("history_empty")}</p>`;
    return;
  }
  let html = "";
  let day = "";
  rows.forEach(r => {
    const d = new Date(r.at).toLocaleDateString(histLocale(),
      { day: "numeric", month: "long", year: "numeric" });
    if(d !== day){
      if(day) html += "</ul>";
      html += `<h3 class="hist-day">${escHtml(d)}</h3><ul class="hist-list">`;
      day = d;
    }
    html += historyRowHTML(r);
  });
  box.innerHTML = html + "</ul>";
  $$("#historyList [data-resume]").forEach(row => {
    const open = () => { if(!resumeSession(row.dataset.resume)) toast(t("history_gone")); };
    row.addEventListener("click", open);
    row.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(); }
    });
  });
}

/* Draw what we have straight away, then fill the account's sessions in when
   they arrive — the screen is never blank waiting on the network. */
function renderHistory(){
  const signedIn = typeof window.cloudSignedIn === "function" && window.cloudSignedIn();
  paintHistory(mergeHistory(null), signedIn);
  if(!signedIn || typeof window.cloudHistory !== "function") return;
  window.cloudHistory(300).then(rows => {
    if(document.body.dataset.view !== "history") return;   // moved on already
    paintHistory(mergeHistory(rows), true);
  }).catch(() => {});
}

/* cloud.js calls this when you sign in or out */
window.historyChanged = function(){
  if(document.body.dataset.view === "history") renderHistory();
};

/* ================= Quiz =================
   The same words as the flashcards, played instead of flipped: the Japanese
   on top, four meanings below, one of them right. Nothing is written back to
   the deck — a game shouldn't decide what you "know". */
const quiz = { items: [], pool: [], index: 0, score: 0, wrong: [], locked: false,
               rounds: [], view: 0, logged: false, historyId: "" };

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
  quiz.rounds = []; quiz.view = 0; quiz.logged = false;
  quiz.historyId = newSession("quiz", wordsLabel(quiz.items), quiz.items.length);
  $("#quizDone").hidden = true;
  $("#quizPlay").hidden = false;
  go("quiz");
  renderQuestion();
}

/* Work out the four options for question i, once. They are then remembered, so
   stepping back shows exactly what you saw rather than a fresh shuffle. */
function buildRound(i){
  const w = quiz.items[i];
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
  return { options: shuffledCopy([right, ...decoys]), right, picked: null };
}

function renderQuestion(){
  if(!quiz.items[quiz.index]) return;
  quiz.view = quiz.index;
  if(!quiz.rounds[quiz.index]) quiz.rounds[quiz.index] = buildRound(quiz.index);
  quiz.locked = false;
  paintRound();
}

/* Draw whichever question quiz.view points at. Anything already answered is
   read-only, with your pick and the right answer still filled in. */
function paintRound(){
  const i = quiz.view;
  const w = quiz.items[i];
  const round = quiz.rounds[i];
  if(!w || !round) return;
  const answered = round.picked !== null;
  $("#quizProgress").textContent = `${i + 1} / ${quiz.items.length}`;
  $("#quizWord").innerHTML = `<span lang="ja">${furiganaHTML(w, "quiz-reading")}</span>`;

  const box = $("#quizOptions");
  box.innerHTML = "";
  round.options.forEach(text => {
    const b = document.createElement("button");
    b.className = "quiz-opt";
    b.type = "button";
    b.textContent = text;
    if(answered){
      b.disabled = true;
      if(text === round.right) b.classList.add("is-right");
      else if(text === round.picked) b.classList.add("is-wrong");
    } else if(i !== quiz.index){
      b.disabled = true;                       // a question not reached yet
    } else {
      b.addEventListener("click", () => answerQuiz(b, text));
    }
    box.appendChild(b);
  });
  paintQuizNav();
  persistQuiz();      // a refresh lands back on exactly this question
}

/* ‹ walks back through what you have answered, › returns towards the question
   you are actually on. You can never step past it. */
function paintQuizNav(){
  const prev = $("#quizPrev"), next = $("#quizNext");
  if(prev) prev.disabled = quiz.view <= 0;
  if(next) next.disabled = quiz.view >= quiz.index;
}
function stepQuiz(by){
  const to = quiz.view + by;
  if(to < 0 || to > quiz.index) return;
  quiz.view = to;
  paintRound();
}

function answerQuiz(btn, text){
  if(quiz.locked) return;
  const round = quiz.rounds[quiz.index];
  if(!round || round.picked !== null) return;        // already answered
  quiz.locked = true;
  round.picked = text;
  const isRight = text === round.right;
  persistQuiz();                                     // the pick is safe before any animation
  const opts = $$(".quiz-opt");
  opts.forEach(b => { b.disabled = true; });
  if(isRight){
    quiz.score++;
    btn.classList.add("is-right");
  } else {
    quiz.wrong.push(quiz.items[quiz.index]);
    btn.classList.add("is-wrong");
    // show which one it should have been, so a miss still teaches something
    const good = opts.find(b => b.textContent === round.right);
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
  // once per game, not once per refresh of the results screen
  if(!quiz.logged){
    quiz.logged = true;
    finishSession(quiz.historyId, wordsLabel(quiz.items), total, quiz.score);
  }
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
  persistQuiz();
}

/* One-time rescue. Until now a word only counted when a deck was played all
   the way to its last card, so a session put down half-way was never paid
   for. The words marked in it are still in the saved session, so credit them
   on the way in. Harmless to run every time: already-counted words are
   ignored, and from now on each swipe credits itself anyway. */
function rescueSavedSession(){
  let session;
  try { session = JSON.parse(localStorage.getItem("session") || "null"); }
  catch(e){ return; }
  if(!session || !Array.isArray(session.known)) return;
  session.known.forEach(id => { if(wordById.has(id)) creditWord(id); });
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
  state.logged = !!session.logged;
  state.historyId = session.historyId || "";
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
  rescueSavedSession();                // pay for anything a half-finished deck never credited
  /* Put a refreshed page back where it left off. Which screen was open is
     already written down by setView(), so we only try the matching one. */
  let last = "home";
  try { last = (JSON.parse(localStorage.getItem("session") || "{}").view) || "home"; }
  catch(e){}
  let restored = "";
  if(last === "quiz" && restoreQuiz()) restored = "quiz";
  else if(restoreSession()) restored = "cards";
  else if(last === "history"){ renderHistory(); setView("history"); restored = "history"; }
  history.replaceState({view: restored || "home"}, ""); // first history step
  window.addEventListener("popstate", e => {
    const view = (e.state && e.state.view) || "home";
    if(view === "history") renderHistory();   // it may have grown since you left it
    setView(view);
  });

  $("#langSelect").addEventListener("change", e => { state.lang = e.target.value; persist(); applyI18n(); });
  $("#brandBtn").addEventListener("click", () => go("home"));

  $("#navFlashcards").addEventListener("click", () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    if(!words.length){ go("home"); return; }
    startDeck(words, t("flashcards"));
  });
  $("#navLessons").addEventListener("click", () => { renderSingleBooks(); go("lessons"); });
  $("#navHistory").addEventListener("click", () => { renderHistory(); go("history"); });

  $("#studyBtn").addEventListener("click", () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    startDeck(words, t("flashcards"));
  });
  $("#specifyBtn").addEventListener("click", () => { renderSpecify(); go("specify"); });
  /* Quiz is a mode you can always reach, like Flashcards. If there is not
     enough picked yet it says so and puts you where you can pick. */
  const goQuiz = () => {
    const words = state.specified.size ? selectedWords().filter(w=>state.specified.has(w.id)) : selectedWords();
    if(quizPool(words).length < 4){ go("home"); toast(t("quiz_need")); return; }
    startQuiz(words);
  };
  $("#quizBtn").addEventListener("click", goQuiz);
  $("#navQuiz").addEventListener("click", goQuiz);
  $("#quizPrev").addEventListener("click", () => stepQuiz(-1));
  $("#quizNext").addEventListener("click", () => stepQuiz(1));
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

  // full screen
  $("#fsCards").addEventListener("click", toggleFull);
  $("#fsQuiz").addEventListener("click", toggleFull);
  ["fullscreenchange","webkitfullscreenchange"].forEach(ev =>
    document.addEventListener(ev, () => { if(!inNativeFull()) { document.body.classList.remove("is-fullscreen"); fullLabels(); syncFsViewport(); } })
  );

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
