"use strict";
/* ============================================================================
   The same account as the kanji site.

   Both sites talk to one Supabase project, so one email and password works on
   either, and the profile (name + picture) is shared. What is NOT shared is
   progress and points: vocabulary keeps its own slot in `user_data.vocab` and
   its own `score_vocab` column, so the two leaderboards rank separately.

   Signing in is optional. With no account everything still saves on the device
   exactly as before; signing in copies that up and keeps phone and laptop in
   step. Only browser-safe keys are in this file — the secret key never is.

   Needs the columns added by supabase-merge-vocab.sql. Until that has been
   run, saving to the cloud fails quietly and the app carries on offline.
   ========================================================================== */
(function () {
  const SUPA_URL = "https://zruanrsjucyuuxepvopx.supabase.co";
  const SUPA_KEY = "sb_publishable_gNRXkMpLnIybNSio-kBc6w_ua851lWn";

  const $ = (s, r = document) => r.querySelector(s);
  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPA_URL, SUPA_KEY)
    : null;

  let me = null;         // signed-in user, or null
  let profile = null;    // row from `profiles`
  let pushTimer = null;
  let pulling = false;   // don't push while we are writing cloud data locally

  /* ---------- tiny DOM helpers ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function say(msg, bad) {
    const box = $("#acc-msg");
    if (!box) return;
    box.textContent = msg || "";
    box.classList.toggle("is-bad", !!bad);
  }

  /* ---------- avatars ---------- */
  /* AVATARS/avatarSVG come from js/avatars.js, shared with the kanji site.
     A stored value we have no drawing for (an old emoji, or an uploaded
     photo) still renders, so nothing a user picked before is lost. */
  function avatarBox(value, cls) {
    const box = el("div", "ava " + (cls || ""));
    const v = value || "🌸";
    if (v.startsWith("data:")) {
      const im = document.createElement("img");
      im.src = v; im.alt = "";
      box.appendChild(im);
    } else {
      const svg = typeof avatarSVG === "function" ? avatarSVG(v) : "";
      if (svg) box.innerHTML = svg;
      else box.textContent = v;            // fall back to the character itself
    }
    return box;
  }

  /* ---------- what we sync ---------- */
  /* Vocabulary's own corner of the account. Kanji keeps `sets`/`stars`
     untouched next door. */
  function localVocab() {
    return {
      favorites: JSON.parse(localStorage.getItem("favorites") || "[]"),
      selected:  JSON.parse(localStorage.getItem("selected") || "[]"),
      lang:      localStorage.getItem("lang") || "hy",
      // which words have already earned their point — travels with the account
      // so a second device doesn't pay for the same word again
      scoredWords: JSON.parse(localStorage.getItem("scoredWords") || "[]"),
    };
  }
  function applyVocab(v) {
    if (!v || typeof v !== "object") return;
    pulling = true;
    if (Array.isArray(v.favorites)) localStorage.setItem("favorites", JSON.stringify(v.favorites));
    if (Array.isArray(v.selected))  localStorage.setItem("selected",  JSON.stringify(v.selected));
    // keep both labels in step, or the shared setting and the account's copy
    // drift apart and the page reverts to the account's older language
    if (v.lang) { localStorage.setItem("lang", v.lang); localStorage.setItem("mn_lang", v.lang); }
    if (Array.isArray(v.scoredWords)) {
      // merge rather than replace: a word paid for on either device stays paid
      const merged = new Set(JSON.parse(localStorage.getItem("scoredWords") || "[]"));
      v.scoredWords.forEach((id) => merged.add(id));
      localStorage.setItem("scoredWords", JSON.stringify([...merged]));
    }
    pulling = false;
    // let the app pick the new values up without a reload
    if (typeof window.reloadFromCloud === "function") window.reloadFromCloud();
  }

  async function pull() {
    if (!sb || !me) return;
    const { data, error } = await sb.from("user_data")
      .select("vocab").eq("user_id", me.id).maybeSingle();
    if (error) return;                       // migration not run yet: stay offline
    if (data && data.vocab && Object.keys(data.vocab).length) applyVocab(data.vocab);
    else push();                             // first sign-in: seed from this device
    savePoints();                            // count everything known so far, incl. before signing in
  }

  function push() {
    if (!sb || !me || pulling) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      await sb.from("user_data")
        .upsert({ user_id: me.id, vocab: localVocab(), updated_at: new Date().toISOString() },
                { onConflict: "user_id" });
    }, 900);                                 // wait for a burst of clicks to settle
  }
  window.cloudPush = push;                   // app.js calls this after it saves

  /* ---------- points ----------
     A harder word is worth more, exactly as on the kanji sister: every level
     up doubles the value. N5 = 1, N4 = 2 (N3 = 4, N2 = 8, N1 = 16 if books
     for those are ever added) — so one N5 word counts half an N4 word. A
     word's level is its book's level; see BOOKS in data.js.

     The total is RECOUNTED from the words you know, never added up step by
     step. A running tally drifts the moment one device misses an update, and
     words learned before signing in would never be paid for at all — which is
     why the score sat at zero. Written to score_vocab, a different column
     from the kanji site's score: same account, two ranks. */
  const LEVEL_POINTS = { n5: 1, n4: 2, n3: 4, n2: 8, n1: 16 };

  function bookLevel(bookId) {
    const b = (typeof BOOKS !== "undefined" ? BOOKS : []).find((x) => x.id === bookId);
    return (b && b.level) || "n5";
  }
  /* a word id is "book-lesson-index" (data.js), so the book is the first piece */
  function knownIds() {
    try { return JSON.parse(localStorage.getItem("scoredWords") || "[]"); }
    catch (e) { return []; }
  }
  function scoreVocab() {
    return knownIds().reduce(
      (n, id) => n + (LEVEL_POINTS[bookLevel(String(id).split("-")[0])] || 1), 0);
  }

  /* called on every swipe, so wait for the burst to settle — same trick as
     push() — and skip the write entirely when the total has not moved */
  let pointsTimer = null;
  function savePoints() {
    clearTimeout(pointsTimer);
    pointsTimer = setTimeout(async () => {
      if (!sb || !me) return;
      const points = scoreVocab();
      if (profile && Number(profile.score_vocab) === points) return;
      profile = Object.assign({}, profile, { score_vocab: points });
      await sb.from("profiles").update({ score_vocab: points }).eq("id", me.id);
    }, 900);
  }
  window.cloudPoints = savePoints;

  /* One finished deck or quiz, written to the same `study_sessions` table the
     kanji site writes to. Ours are stamped app:"vocab"; the kanji sister
     leaves `app` empty, which is how the history screen tells them apart. */
  async function logSession(row) {
    if (!sb || !me) return;
    await sb.from("study_sessions").insert({
      user_id: me.id, app: "vocab",
      set_name: row.set_name || "vocabulary",
      total: row.total || 0,
      known: row.known || 0,
      unknown: Math.max(0, (row.total || 0) - (row.known || 0)),
      skipped: row.skipped || 0,
    });
  }
  window.cloudSession = logSession;

  /* Everything this account has ever finished, on either site. Signed out (or
     if the table is unreachable) it returns null and the history screen shows
     just what this device remembers. */
  async function fetchHistory(limit) {
    if (!sb || !me) return null;
    const { data, error } = await sb.from("study_sessions")
      .select("id,app,set_name,total,known,unknown,skipped,created_at")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(limit || 300);
    if (error) return null;
    return data || [];
  }
  window.cloudHistory = fetchHistory;
  window.cloudSignedIn = () => !!me;

  /* ---------- the panel ---------- */
  function openPanel() {
    $("#acc-modal").hidden = false;
    render();
  }
  function closePanel() { $("#acc-modal").hidden = true; }

  function render() {
    const out = $("#acc-body");
    out.innerHTML = "";
    say("");
    $("#acc-title").textContent = me ? (profile && profile.display_name) || "Account" : t2("signin");
    me ? renderAccount(out) : renderSignIn(out);
  }

  /* very small string table; the app's own UI has its three languages already */
  const STR = {
    en:{signin:"Sign in",email:"Email",pass:"Password",name:"Name",code:"Invite code",
        go:"Sign in",make:"Create account",have:"Already have an account?",
        need:"No account yet?",out:"Sign out",pic:"Picture",
        why:"Sign in to keep your words on every device.",
        pts:"Vocabulary points",board:"Leaderboard",
        prog:"My progress",prog_none:"No words loaded.",
        prog_start:"No study yet — start with the flashcards.",
        streak:"Day streak",session:"Session",
        today:"today",yesterday:"yesterday",days_ago:"days ago",
        board_off:"The leaderboard isn't switched on yet.",
        board_empty:"Nobody has points yet.",
        board_note:"An N5 word is 1 point, an N4 word 2. Kanji is ranked separately.",
        upload:"Upload a photo",upload_bad:"Could not read that picture.",
        pic_ok:"Picture saved.",pic_bad:"Could not save the picture:",
        pic_gone:"The picture was not saved — sign out and back in.",
        admin:"Admin panel",people:"People",people_note:"vocabulary / kanji points",
        invites:"Invite codes",code_one:"Create a one-time code",
        code_five:"Create a code for 5 people",
        invites_note:"Nobody can sign up without a code.",
        no_codes:"No codes — nobody can sign up.",spent:"used up",
        copy:"Tap to copy",copied:"Copied:",delete:"Delete code",
        rename:"Change your name",save:"Save",name_ok:"Name changed."},
    ru:{signin:"Вход",email:"Эл. почта",pass:"Пароль",name:"Имя",code:"Код приглашения",
        go:"Войти",make:"Создать аккаунт",have:"Уже есть аккаунт?",
        need:"Нет аккаунта?",out:"Выйти",pic:"Картинка",
        why:"Войдите, чтобы слова были на всех устройствах.",
        pts:"Очки словаря",board:"Таблица",
        prog:"Мой прогресс",prog_none:"Слова не загружены.",
        prog_start:"Занятий ещё нет — начни с карточек.",
        streak:"Дней подряд",session:"Занятие",
        today:"сегодня",yesterday:"вчера",days_ago:"дн. назад",
        board_off:"Таблица ещё не включена.",
        board_empty:"Пока ни у кого нет очков.",
        board_note:"Слово N5 — 1 очко, N4 — 2. Кандзи считаются отдельно.",
        upload:"Загрузить фото",upload_bad:"Не удалось прочитать эту картинку.",
        pic_ok:"Картинка сохранена.",pic_bad:"Не удалось сохранить картинку:",
        pic_gone:"Картинка не сохранилась — выйди и войди снова.",
        admin:"Панель админа",people:"Люди",people_note:"очки словаря / кандзи",
        invites:"Коды приглашений",code_one:"Создать одноразовый код",
        code_five:"Создать код на 5 человек",
        invites_note:"Без кода зарегистрироваться нельзя.",
        no_codes:"Кодов нет — никто не сможет зарегистрироваться.",spent:"использован",
        copy:"Нажми, чтобы скопировать",copied:"Скопировано:",delete:"Удалить код",
        rename:"Изменить имя",save:"Сохранить",name_ok:"Имя изменено."},
    hy:{signin:"Մուտք",email:"Էլ. փոստ",pass:"Գաղտնաբառ",name:"Անուն",code:"Հրավերի կոդ",
        go:"Մուտք",make:"Ստեղծել հաշիվ",have:"Արդեն ունե՞ս հաշիվ",
        need:"Հաշիվ չունե՞ս",out:"Դուրս գալ",pic:"Նկար",
        why:"Մուտք գործիր՝ բառերը բոլոր սարքերում պահելու համար։",
        pts:"Բառապաշարի միավորներ",board:"Աղյուսակ",
        prog:"Իմ առաջընթացը",prog_none:"Բառեր չեն բեռնվել։",
        prog_start:"Դեռ պարապմունք չկա — սկսիր քարտերից։",
        streak:"Օրերի շարք",session:"Պարապմունք",
        today:"այսօր",yesterday:"երեկ",days_ago:"օր առաջ",
        board_off:"Աղյուսակը դեռ միացված չէ։",
        board_empty:"Դեռ ոչ ոք միավոր չունի։",
        board_note:"N5 բառ՝ 1 միավոր, N4՝ 2։ Կանջին հաշվվում է առանձին։",
        upload:"Վերբեռնել լուսանկար",upload_bad:"Չհաջողվեց կարդալ այդ նկարը։",
        pic_ok:"Նկարը պահվեց։",pic_bad:"Չհաջողվեց պահել նկարը՝",
        pic_gone:"Նկարը չպահվեց — դուրս եկ ու նորից մուտք գործիր։",
        admin:"Ադմին վահանակ",people:"Մարդիկ",people_note:"բառապաշարի / կանջիի միավորներ",
        invites:"Հրավերի կոդեր",code_one:"Ստեղծել մեկանգամյա կոդ",
        code_five:"Ստեղծել կոդ 5 հոգու համար",
        invites_note:"Առանց կոդի ոչ ոք չի կարող գրանցվել։",
        no_codes:"Կոդ չկա — ոչ ոք չի կարող գրանցվել։",spent:"օգտագործված",
        copy:"Սեղմիր՝ պատճենելու համար",copied:"Պատճենվեց՝",delete:"Ջնջել կոդը",
        rename:"Փոխել անունը",save:"Պահպանել",name_ok:"Անունը փոխվեց։"},
  };
  const t2 = (k) => {
    const l = localStorage.getItem("mn_lang") || localStorage.getItem("lang") || "hy";
    return (STR[l] && STR[l][k]) || STR.en[k];
  };

  function field(id, label, type) {
    const w = el("label", "acc-field");
    w.appendChild(el("span", "acc-field__l", label));
    const i = document.createElement("input");
    i.id = id; i.type = type || "text"; i.className = "acc-input";
    w.appendChild(i);
    return w;
  }

  function renderSignIn(out) {
    let mode = "in";
    const form = el("div", "acc-form");
    const build = () => {
      form.innerHTML = "";
      form.appendChild(el("p", "acc-why", t2("why")));
      if (mode === "up") form.appendChild(field("acc-name", t2("name")));
      form.appendChild(field("acc-email", t2("email"), "email"));
      form.appendChild(field("acc-pass", t2("pass"), "password"));
      if (mode === "up") form.appendChild(field("acc-code", t2("code")));

      const go = el("button", "btn btn--primary", mode === "in" ? t2("go") : t2("make"));
      go.addEventListener("click", mode === "in" ? doSignIn : doSignUp);
      form.appendChild(go);

      const swap = el("button", "linkbtn", mode === "in" ? t2("need") : t2("have"));
      swap.addEventListener("click", () => { mode = mode === "in" ? "up" : "in"; build(); say(""); });
      form.appendChild(swap);
    };
    build();
    out.appendChild(form);
  }

  async function doSignIn() {
    if (!sb) return say("offline", true);
    const email = $("#acc-email").value.trim();
    const pass = $("#acc-pass").value;
    if (!email || !pass) return say(t2("email") + " + " + t2("pass"), true);
    say("…");
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) say(error.message, true);
  }

  async function doSignUp() {
    if (!sb) return say("offline", true);
    const display_name = $("#acc-name").value.trim();
    const email = $("#acc-email").value.trim();
    const pass = $("#acc-pass").value;
    const invite_code = $("#acc-code").value.trim();
    if (!display_name || !email || !pass) return say(t2("name") + " + " + t2("email"), true);
    say("…");
    /* the kanji site gates sign-up behind an invite code; the very first
       account ever created needs none, and becomes the admin */
    const ok = await sb.rpc("check_invite", { code: invite_code });
    if (ok.error || ok.data !== true) return say(t2("code"), true);
    const { error } = await sb.auth.signUp({
      email, password: pass, options: { data: { display_name, invite_code } },
    });
    if (error) say(error.message, true);
  }

  function renderAccount(out) {
    const head = el("div", "acc-head");
    const pic = el("button", "acc-pic");
    pic.appendChild(avatarBox(profile && profile.avatar, "ava--lg"));
    pic.addEventListener("click", () => togglePicker(out));
    head.appendChild(pic);
    const who = el("div", "acc-who");
    who.appendChild(nameRow());
    who.appendChild(el("div", "acc-pts", t2("pts") + ": " + scoreVocab()));
    head.appendChild(who);
    out.appendChild(head);

    const prog = el("div", "acc-board");
    out.appendChild(prog);
    renderProgress(prog);

    const board = el("div", "acc-board");
    out.appendChild(board);
    renderBoard(board);

    if (profile && profile.is_admin) {
      const adm = el("button", "btn btn--primary acc-admin", t2("admin"));
      adm.addEventListener("click", () => toggleAdmin(out));
      out.appendChild(adm);
    }

    const out2 = el("button", "btn btn--ghost", t2("out"));
    out2.addEventListener("click", async () => { await sb.auth.signOut(); });
    out.appendChild(out2);
  }

  /* ---------------- admin panel ----------------
     Only shown to the admin, and only useful to them: who has signed up, and
     the invite codes that let anyone sign up at all. The database enforces
     both — editing this page gets nobody in. */
  function toggleAdmin(out) {
    const open = out.querySelector(".acc-admin-box");
    if (open) { open.remove(); return; }
    const box = el("div", "acc-admin-box");
    out.appendChild(box);
    renderPeople(box);
    renderInvites(box);
  }

  async function renderPeople(box) {
    const wrap = el("div", "admin-block");
    wrap.appendChild(el("h3", "acc-board__title", t2("people")));
    box.appendChild(wrap);
    const { data, error } = await sb.from("profiles")
      .select("display_name, avatar, score, score_vocab, last_seen");
    if (error) { wrap.appendChild(el("p", "acc-board__note", error.message)); return; }
    const rows = (data || []).slice()
      .sort((a, b) => (b.score_vocab || 0) - (a.score_vocab || 0));
    const list = el("div", "rank-list");
    rows.forEach((r) => {
      const row = el("div", "rank-row");
      row.appendChild(avatarBox(r.avatar, "ava--sm"));
      row.appendChild(el("span", "rank-name", r.display_name || "—"));
      row.appendChild(el("span", "rank-pts",
        Math.round(r.score_vocab || 0) + " / " + Math.round(r.score || 0)));
      list.appendChild(row);
    });
    if (!rows.length) list.appendChild(el("p", "acc-board__note", t2("board_empty")));
    wrap.appendChild(list);
    wrap.appendChild(el("p", "acc-board__note", t2("people_note")));
  }

  async function renderInvites(box) {
    const wrap = el("div", "admin-block");
    wrap.appendChild(el("h3", "acc-board__title", t2("invites")));
    const list = el("div", "rank-list");
    wrap.appendChild(list);
    const one = el("button", "btn btn--primary acc-upload", t2("code_one"));
    const five = el("button", "btn btn--ghost acc-upload", t2("code_five"));
    wrap.appendChild(one);
    wrap.appendChild(five);
    wrap.appendChild(el("p", "acc-board__note", t2("invites_note")));
    box.appendChild(wrap);

    async function draw() {
      list.innerHTML = "";
      const { data, error } = await sb.from("invites")
        .select("code, uses, max_uses").order("created_at");
      if (error) { list.appendChild(el("p", "acc-board__note", error.message)); return; }
      (data || []).forEach((c) => {
        const spent = c.max_uses != null && c.uses >= c.max_uses;
        const row = el("div", "rank-row" + (spent ? " is-spent" : ""));
        const code = el("button", "rank-name invite-code", c.code);
        code.title = t2("copy");
        code.addEventListener("click", () => copyText(c.code));
        row.appendChild(code);
        row.appendChild(el("span", "rank-pts",
          spent ? t2("spent") : (c.max_uses != null ? c.uses + " / " + c.max_uses : String(c.uses))));
        const del = el("button", "rank-no", "✕");
        del.setAttribute("aria-label", t2("delete"));
        del.addEventListener("click", async () => {
          await sb.from("invites").delete().eq("code", c.code);
          draw();
        });
        row.appendChild(del);
        list.appendChild(row);
      });
      if (!(data || []).length) list.appendChild(el("p", "acc-board__note", t2("no_codes")));
    }
    async function make(button, maxUses, label) {
      button.disabled = true;
      const code = makeCode();
      const { error } = await sb.from("invites").insert({ code, max_uses: maxUses, label });
      button.disabled = false;
      if (error) { list.appendChild(el("p", "acc-board__note", error.message)); return; }
      await draw();
      copyText(code);
    }
    one.addEventListener("click", () => make(one, 1, "one-time"));
    five.addEventListener("click", () => make(five, 5, "five-uses"));
    await draw();
  }

  /* readable random code, no 0/O or 1/I to mistype */
  function makeCode() {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 4; i++) out += abc[Math.floor(Math.random() * abc.length)];
    out += "-";
    for (let i = 0; i < 4; i++) out += abc[Math.floor(Math.random() * abc.length)];
    return out;
  }
  function copyText(text) {
    try { navigator.clipboard.writeText(text); say(t2("copied") + " " + text); }
    catch (e) { say(text); }
  }

  /* ---------------- the name, which you can change ----------------
     The profile is shared with the kanji site, so a rename here shows up
     there too — one account, one name, one picture. The database has the
     final say on politeness, and whatever it objects to is shown as-is. */
  function nameRow() {
    const wrap = el("div", "acc-name-row");
    const shown = (profile && profile.display_name) || (me.email || "").split("@")[0];
    wrap.appendChild(el("span", "acc-name", shown));
    const edit = el("button", "acc-name-edit", "✎");
    edit.title = t2("rename");
    edit.setAttribute("aria-label", t2("rename"));
    wrap.appendChild(edit);

    edit.addEventListener("click", () => {
      const form = document.createElement("form");
      form.className = "acc-name-form";
      const input = document.createElement("input");
      input.className = "acc-input";
      input.type = "text";
      input.value = shown;
      input.maxLength = 30;
      input.setAttribute("aria-label", t2("name"));
      const save = el("button", "btn btn--primary", t2("save"));
      save.type = "submit";
      form.appendChild(input);
      form.appendChild(save);
      wrap.replaceWith(form);
      input.focus();
      input.select();

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const value = input.value.trim().slice(0, 30);
        if (!value) return;
        save.disabled = true;
        const { data, error } = await sb.from("profiles")
          .update({ display_name: value }).eq("id", me.id)
          .select("display_name").maybeSingle();
        save.disabled = false;
        if (error) { say(error.message, true); return; }
        if (!data) { say(t2("pic_gone"), true); return; }
        profile = Object.assign({}, profile, { display_name: data.display_name });
        render();
        paintTab();
        say(t2("name_ok"));
      });
    });
    return wrap;
  }

  /* ---------------- my own progress ----------------
     Split by level, because N5 and N4 are two different climbs and one merged
     bar hides which of them you are actually on. Word counts come from the
     device (the same list the score is counted from); the study history comes
     from this site's own rows — study_sessions.app = 'vocab' — so the kanji
     sister's sessions never show up here. */
  async function renderProgress(box) {
    box.innerHTML = "";
    box.appendChild(el("h3", "acc-board__title", t2("prog")));

    const known = new Set(knownIds());
    const tally = new Map();                 // "n5" -> { known, total }
    (typeof WORDS !== "undefined" ? WORDS : []).forEach((w) => {
      const lv = bookLevel(w.b);
      if (!tally.has(lv)) tally.set(lv, { known: 0, total: 0 });
      const t = tally.get(lv);
      t.total++;
      if (known.has(w.id)) t.known++;
    });

    if (!tally.size) {
      box.appendChild(el("p", "acc-board__note", t2("prog_none")));
      return;
    }

    const list = el("div", "prog-list");
    [...tally.keys()].sort().reverse().forEach((lv) => {   // n5 first, then n4
      const t = tally.get(lv);
      const pct = t.total ? Math.round((t.known / t.total) * 100) : 0;
      const row = el("div", "prog-row");
      row.appendChild(el("span", "prog-lv", lv.toUpperCase()));
      const bar = el("div", "prog-bar");
      bar.appendChild(el("span")).style.width = pct + "%";
      row.appendChild(bar);
      row.appendChild(el("span", "prog-n", t.known + " / " + t.total));
      list.appendChild(row);
    });
    box.appendChild(list);

    const { data, error } = await sb.from("study_sessions")
      .select("known, total, created_at")
      .eq("app", "vocab")
      .order("created_at", { ascending: false }).limit(7);
    if (error) return;
    const sess = data || [];
    if (!sess.length) {
      box.appendChild(el("p", "acc-board__note", t2("prog_start")));
      return;
    }
    box.appendChild(el("p", "acc-board__note", t2("streak") + ": " + streak(sess)));
    const hist = el("div", "rank-list");
    sess.forEach((s) => {
      const r = el("div", "rank-row");
      r.appendChild(el("span", "rank-name", t2("session")));
      r.appendChild(el("span", "rank-pts", s.known + "/" + s.total));
      r.appendChild(el("span", "rank-no", when(s.created_at)));
      hist.appendChild(r);
    });
    box.appendChild(hist);
  }

  /* how many days in a row (counting back from today) had a session */
  function streak(sessions) {
    const days = new Set(sessions.map((s) => String(s.created_at).slice(0, 10)));
    let n = 0;
    const d = new Date();
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!days.has(key)) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  function when(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return t2("today");
    if (days === 1) return t2("yesterday");
    return days + " " + t2("days_ago");
  }

  /* ---------------- leaderboard ----------------
     Reads the shared `leaderboard` view, which exposes only name, picture and
     points — never emails. Sorted by score_vocab, this site's own column, so
     the two sisters rank independently even though it is one account. */
  async function renderBoard(box) {
    box.innerHTML = "";
    box.appendChild(el("h3", "acc-board__title", t2("board")));
    const { data, error } = await sb.from("leaderboard").select("*");
    if (error) {
      box.appendChild(el("p", "acc-board__note", t2("board_off")));
      return;
    }
    /* your own row comes from this device, not the view: the write that
       settles your score is held back a moment, so the view can still be a
       beat behind and show a lower number than the one just above it */
    const myName = (profile && profile.display_name) || "";
    const rows = (data || [])
      .map((r) => (r.display_name === myName ? Object.assign({}, r, { score_vocab: scoreVocab() }) : r))
      .sort((a, b) => (b.score_vocab || 0) - (a.score_vocab || 0));
    if (!rows.length) {
      box.appendChild(el("p", "acc-board__note", t2("board_empty")));
      return;
    }
    const list = el("div", "rank-list");
    rows.forEach((r, i) => {
      const row = el("div", "rank-row" + (r.display_name === myName ? " is-me" : ""));
      row.appendChild(el("span", "rank-no", "#" + (i + 1)));
      row.appendChild(avatarBox(r.avatar, "ava--sm"));
      row.appendChild(el("span", "rank-name", r.display_name || "—"));
      row.appendChild(el("span", "rank-pts", String(Math.round(r.score_vocab || 0))));
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(el("p", "acc-board__note", t2("board_note")));
  }

  function togglePicker(out) {
    const open = out.querySelector(".acc-picker");
    if (open) { open.remove(); return; }
    const pick = el("div", "acc-picker");
    (typeof AVATAR_KEYS !== "undefined" ? AVATAR_KEYS : []).forEach((k) => {
      const b = el("button", "acc-choice");
      if (profile && profile.avatar === k) b.classList.add("is-on");
      b.appendChild(avatarBox(k));
      b.addEventListener("click", () => saveAvatar(k));
      pick.appendChild(b);
    });
    out.appendChild(pick);

    /* ...or your own photo, exactly as on the kanji sister. The <input> is
       hidden inside the label, so the whole button is the tap target. */
    const up = el("label", "btn btn--ghost acc-upload", t2("upload"));
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      try { saveAvatar(await shrink(f)); }
      catch (e) { say(t2("upload_bad"), true); }
    });
    up.appendChild(file);
    out.appendChild(up);
  }

  /* Squeeze any photo into a small square, so a picture from a phone camera
     still fits in one database row instead of being rejected for size. */
  function shrink(fileObj) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(fileObj);
      const img = new Image();
      img.onload = () => {
        const S = 128;
        const c = document.createElement("canvas");
        c.width = S; c.height = S;
        const side = Math.min(img.width, img.height);      // centre square crop
        c.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2,
          side, side, 0, 0, S, S);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  /* Ask the database to hand the row back, and believe only what it returns.
     This used to fire and forget: the picture changed on screen, the save
     failed quietly, and the old picture came back on the next visit. */
  async function saveAvatar(v) {
    if (!sb || !me) return;
    const { data, error } = await sb.from("profiles")
      .update({ avatar: v }).eq("id", me.id).select("avatar").maybeSingle();
    if (error) { say(t2("pic_bad") + " " + error.message, true); return; }
    if (!data) { say(t2("pic_gone"), true); return; }
    profile = Object.assign({}, profile, { avatar: data.avatar });
    render();
    paintTab();
    say(t2("pic_ok"));
  }

  /* ---------- the button in the top bar ---------- */
  function paintTab() {
    const tab = $("#accTab");
    if (!tab) return;
    tab.innerHTML = "";
    tab.classList.toggle("is-in", !!me);
    if (me) tab.appendChild(avatarBox(profile && profile.avatar, "ava--sm"));
    else tab.textContent = "☺";
    tab.title = me ? ((profile && profile.display_name) || "Account") : t2("signin");
  }

  /* ---------- session ---------- */
  async function loadProfile() {
    if (!sb || !me) { profile = null; return; }
    const { data } = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();
    profile = data || null;
  }

  async function onSession(session) {
    me = (session && session.user) || null;
    await loadProfile();
    paintTab();
    if (!$("#acc-modal").hidden) render();
    if (me) pull();
    // signing in adds the other site's sessions to the history, out takes them away
    if (typeof window.historyChanged === "function") window.historyChanged();
  }

  function init() {
    const tab = $("#accTab");
    if (tab) tab.addEventListener("click", openPanel);
    const close = $("#acc-close");
    if (close) close.addEventListener("click", closePanel);
    const modal = $("#acc-modal");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closePanel(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) closePanel();
    });

    if (!sb) { paintTab(); return; }         // SDK blocked: app still works offline
    sb.auth.getSession().then(({ data }) => onSession(data && data.session));
    sb.auth.onAuthStateChange((_e, session) => onSession(session));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
