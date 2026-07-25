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

  /* ---------- points ---------- */
  /* One point per word marked known. Written to score_vocab, which is a
     different column from the kanji site's score — same account, two ranks. */
  async function addPoints(n) {
    if (!sb || !me || !n) return;
    const next = Number((profile && profile.score_vocab) || 0) + n;
    profile = Object.assign({}, profile, { score_vocab: next });
    await sb.from("profiles").update({ score_vocab: next }).eq("id", me.id);
  }
  window.cloudPoints = addPoints;

  async function logSession(known, total) {
    if (!sb || !me) return;
    await sb.from("study_sessions")
      .insert({ user_id: me.id, app: "vocab", set_name: "vocabulary",
                total: total, known: known, unknown: Math.max(0, total - known) });
  }
  window.cloudSession = logSession;

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
        pts:"Vocabulary points",board:"Leaderboard"},
    ru:{signin:"Вход",email:"Эл. почта",pass:"Пароль",name:"Имя",code:"Код приглашения",
        go:"Войти",make:"Создать аккаунт",have:"Уже есть аккаунт?",
        need:"Нет аккаунта?",out:"Выйти",pic:"Картинка",
        why:"Войдите, чтобы слова были на всех устройствах.",
        pts:"Очки словаря",board:"Таблица"},
    hy:{signin:"Մուտք",email:"Էլ. փոստ",pass:"Գաղտնաբառ",name:"Անուն",code:"Հրավերի կոդ",
        go:"Մուտք",make:"Ստեղծել հաշիվ",have:"Արդեն ունե՞ս հաշիվ",
        need:"Հաշիվ չունե՞ս",out:"Դուրս գալ",pic:"Նկար",
        why:"Մուտք գործիր՝ բառերը բոլոր սարքերում պահելու համար։",
        pts:"Բառապաշարի միավորներ",board:"Աղյուսակ"},
  };
  const t2 = (k) => {
    const l = localStorage.getItem("lang") || "hy";
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
    who.appendChild(el("div", "acc-name", (profile && profile.display_name) || ""));
    who.appendChild(el("div", "acc-pts", t2("pts") + ": " + Math.round((profile && profile.score_vocab) || 0)));
    head.appendChild(who);
    out.appendChild(head);

    const out2 = el("button", "btn btn--ghost", t2("out"));
    out2.addEventListener("click", async () => { await sb.auth.signOut(); });
    out.appendChild(out2);
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
  }

  async function saveAvatar(v) {
    if (!sb || !me) return;
    profile = Object.assign({}, profile, { avatar: v });
    render();
    await sb.from("profiles").update({ avatar: v }).eq("id", me.id);
    paintTab();
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
