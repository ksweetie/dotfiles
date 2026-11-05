// Actions: per-repo commands (setup, dev server, ...) for the shown space's
// checkout, Conductor-style: a tab strip (one tab per action, plus a plain
// Terminal) above the selected one's live terminal, with Run/Stop and key
// commands. Plus lifecycle hooks:
//   hook "create": runs (in its tab here) the first time a new worktree under
//                  ~/.herdr/worktrees opens in a space (herdr's New worktree,
//                  the new-workspace dialog, or plain `git worktree add`).
//   hook "remove": runs in a background terminal after such a worktree is
//                  removed (herdr's Remove worktree or `git worktree remove`).
//
// Layout: this mod in a block with id "actions" (the tab strip), and a block
// with id "actions-term" below it, whose content this mod switches between the
// selected action's terminal and a placeholder copy of itself ({ placeholder }).
// Action terminals aren't tabs: they're core terminals labelled
// herdr.action=<id> and herdr.action.path=<checkout>, shown only here.
//
// Config: ~/.config/herdr-actions/actions.json, keyed by the repo's main checkout:
//   { "repos": { "<main checkout>": { "actions": [{ id, name, command, hook }] } } }
// Hook bookkeeping (which worktrees exist, their branch): ~/.config/herdr-actions/state.json.
// Keys (keys.json): "actions.toggle:<id>", "actions.run:<id>", "actions.stop:<id>".
// Commands get HERDR_ROOT_PATH, HERDR_WORKSPACE_PATH, HERDR_WORKSPACE_NAME,
// HERDR_BRANCH, HERDR_BRANCH_DB, HERDR_ACTION and HERDR_HOOK in their environment.
//
// The same mod draws the editor dialog when opened with props { editor: true }.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import {
  run, props, closeOverlay, openOverlay, theme, spaces, panes, terminals, keys, exec, hc, home, layout,
  readTextFile, writeTextFile, notify, nextCommand, shared, setShared,
} from "herdr";

const DIR = () => `${home()}/.config/herdr-actions`;
const CONFIG = () => `${DIR()}/actions.json`;
const STATE = () => `${DIR()}/state.json`;
const WORKTREES = () => `${home()}/.herdr/worktrees`;
const SCAN_MS = 4000;
const SHELL = "/bin/zsh";
const ICON = (n) => `mods/actions/${n}.svg`;
const HOOKS = [[null, "Manual"], ["create", "On create"], ["remove", "On remove"]];
const TERMINAL = { id: "__terminal", name: "Terminal", command: null, hook: null };
const HEADER_PX = 40;

const inside = (p, dir) => p === dir || p.startsWith(dir + "/");
const basename = (p) => p.replace(/\/+$/, "").split("/").pop();
const tilde = (p) => (p && p.startsWith(home()) ? `~${p.slice(home().length)}` : p);
const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const branchDbOn = (envLocal) => /^BRANCH_DB=1$/m.test(envLocal ?? "");
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const find = (node, id) => {
  if (!node) return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
};
const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };

async function readJson(path) {
  const raw = await readTextFile(path).catch(() => null);
  if (raw === null) return { raw: null, data: null };
  try { return { raw, data: JSON.parse(raw) }; }
  catch (e) { return { raw, data: null, error: `${tilde(path)}: ${e.message ?? e}` }; }
}

async function writeJson(path, data, expected) {
  await writeTextFile(path, JSON.stringify(data, null, 2) + "\n", expected);
}

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, ps) {
  const tabs = new Set(s.tabs.map((x) => x.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// The checkout a folder is in: { top, main, name, branch }, or null outside git.
async function repoOf(folder) {
  const r = await exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir", "--abbrev-ref", "HEAD"], { cwd: folder }).catch(() => null);
  if (!r || r.code !== 0) return null;
  const [top, common, branch] = r.stdout.trim().split("\n");
  const main = common.endsWith("/.git") ? common.slice(0, -5) : common;
  return { top, main, name: basename(top), branch: branch === "HEAD" ? null : branch };
}

// `git worktree list --porcelain` → [{ path, branch, prunable }].
function parseWorktrees(text) {
  return text.split(/\n\n+/).map((block) => {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    return path ? { path, branch, prunable: lines.some((l) => l.startsWith("prunable")) } : null;
  }).filter(Boolean);
}

// The terminal an action runs in for a checkout (labels set when it started).
const termOf = (id, top) => terminals().find((t) =>
  t.state === "live" && t.labels?.["herdr.action"] === id && t.labels?.["herdr.action.path"] === top);
// Busy: something other than the terminal's own shell is in the foreground.
const isBusy = (t) => Boolean(t?.foreground?.pid) && t.foreground.pid !== t.pid;

function envFor(a, ctx, hook) {
  return [
    `HERDR_ROOT_PATH=${ctx.main}`,
    `HERDR_WORKSPACE_PATH=${ctx.top}`,
    `HERDR_WORKSPACE_NAME=${ctx.name}`,
    `HERDR_BRANCH=${ctx.branch ?? ""}`,
    `HERDR_BRANCH_DB=${ctx.branchDb ? 1 : ""}`,
    `HERDR_ACTION=${a.id}`,
    `HERDR_HOOK=${hook ?? ""}`,
  ];
}

export default class Actions extends View {
  init(_props, cx) {
    this.mode = props()?.editor ? "editor" : props()?.placeholder ? "placeholder" : "panel";
    this.error = "";
    if (this.mode === "editor") return this.initEditor(cx);
    if (this.mode === "placeholder") return;

    this.me = hex(8);
    this.config = null;
    this.configError = "";
    this.ctx = undefined; // undefined: looking; null: not in git
    this.ctxKey = null;
    this.selected = load("selected", {}); // checkout → action id
    this.collapsed = load("collapsed", false);
    this.background = {}; // address → { action, name } of running remove hooks
    this.pending = {}; // `${id}|${top}` → true while starting
    cx.spawn(async (cx) => { await this.loadConfig(); cx.notify(); });
    cx.timer.every(SCAN_MS, (cx) => this.tick(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        try { await this.command(c, cx); } catch (e) { this.fail(e); }
        cx.notify();
      }
    });
  }

  fail(e, title = "Action failed") {
    notify({ title, body: String(e?.message ?? e), level: "error" });
  }

  async loadConfig() {
    const { data, error } = await readJson(CONFIG());
    this.configError = error ?? "";
    if (data || !error) this.config = data ?? { repos: {} };
    this.configStamp = shared("actions.config");
  }

  actionsFor(main) {
    return this.config?.repos?.[main]?.actions ?? [];
  }

  // The tabs: actions you run by hand or on create, then a plain terminal.
  tabsFor(main) {
    return [...this.actionsFor(main).filter((a) => a.hook !== "remove"), TERMINAL];
  }

  // ---- the shown space's checkout ----

  where() {
    const s = spaces().find((x) => x.active);
    if (!s) return { key: "none" };
    if (s.machine) return { key: `remote:${s.id}`, space: s, remote: true };
    const folder = place(s, panes());
    return { key: `${s.id}|${folder}`, space: s, folder };
  }

  refreshCtx(cx, w, quiet) {
    if (!quiet) { this.ctx = undefined; this.ctxKey = w.key; }
    cx.spawn(async (cx) => {
      const r = w.folder ? await repoOf(w.folder) : null;
      if (r) r.branchDb = branchDbOn(await readTextFile(`${r.top}/.env.local`).catch(() => null));
      if (this.ctxKey !== w.key) return;
      if (this.ctx === undefined || !same(r, this.ctx)) { this.ctx = r; cx.notify(); }
    });
  }

  select(top, id) {
    this.selected[top] = id;
    keep("selected", this.selected);
  }

  // The selected tab: the remembered one, else a running action, else the first.
  selectedTab(ctx, tabs) {
    const want = this.selected[ctx.top];
    return tabs.find((a) => a.id === want)
      ?? tabs.find((a) => isBusy(termOf(a.id, ctx.top)))
      ?? tabs[0];
  }

  // ---- running ----

  async start(a, ctx, cx, { hook = null, select = true } = {}) {
    if (select) this.select(ctx.top, a.id);
    const key = `${a.id}|${ctx.top}`;
    if (this.pending[key]) return;
    const existing = termOf(a.id, ctx.top);
    if (existing) {
      if (a.command && !isBusy(existing)) await hc(["send", existing.address, a.command]);
      return;
    }
    this.pending[key] = true;
    cx.notify();
    try {
      const line = a.command ? `${a.command}; exec ${SHELL} -li` : `exec ${SHELL} -li`;
      const r = await hc([
        "run", "--json", "--bg", "--keep", "--no-parent", "--no-notify", "--cwd", ctx.top,
        "--label", `herdr.action=${a.id}`, "--label", `herdr.action.path=${ctx.top}`,
        "--", "env", ...envFor(a, ctx, hook), SHELL, "-lic", line,
      ]);
      if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hc run failed").trim());
      // Wait for the core to list it, so the block switches over at once.
      for (let i = 0; i < 30 && !termOf(a.id, ctx.top); i++) await cx.sleep(100);
    } finally {
      delete this.pending[key];
    }
  }

  async stop(a, ctx) {
    const t = termOf(a.id, ctx.top);
    if (t && isBusy(t)) await hc(["keys", t.address, "ctrl+c"]);
  }

  // A remove hook: the checkout is gone, so no tab; a terminal that removes itself when done.
  async runInBackground(a, ctx) {
    const r = await hc([
      "run", "--json", "--bg", "--no-parent", "--no-notify", "--rm", "--cwd", home(),
      "--label", `herdr.action=${a.id}`, "--label", `herdr.action.hook=remove`,
      "--", "env", ...envFor(a, ctx, "remove"), SHELL, "-lic", a.command,
    ]);
    if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hc run failed").trim());
    const address = JSON.parse(r.stdout).address;
    this.background[address] = { action: a.name, name: ctx.name };
    notify({ title: `${a.name}: ${ctx.name}`, body: "Running in the background.", level: "info" });
  }

  async command(c, cx) {
    if (String(c).trim() === "edit") return this.openEditor();
    const m =/^(run|stop|toggle)[:\s-]+(.+)$/.exec(String(c ?? "").trim());
    if (!m) return;
    const [, verb, id] = m;
    const ctx = this.ctx;
    if (!ctx || this.ctxKey !== this.where().key) return notify({ title: "Actions", body: "The shown space isn't in a git checkout yet.", level: "warning" });
    const a = this.tabsFor(ctx.main).find((x) => x.id === id);
    if (!a) return notify({ title: "Actions", body: `No action "${id}" for ${basename(ctx.main)}.`, level: "warning" });
    if (this.collapsed) this.collapse(false);
    const busy = isBusy(termOf(a.id, ctx.top));
    if (verb === "stop" || (verb === "toggle" && busy)) { this.select(ctx.top, a.id); return this.stop(a, ctx); }
    return this.start(a, ctx, cx);
  }

  // ---- hooks ----

  tick(cx) {
    cx.spawn(async (cx) => {
      await this.loadConfig();
      const w = this.where();
      if (w.key === this.ctxKey && !w.remote) this.refreshCtx(cx, w, true);
      for (const [address, job] of Object.entries(this.background)) {
        const t = terminals().find((x) => x.address === address);
        if (t && t.state === "live") continue;
        delete this.background[address];
        notify({ title: `${job.action}: ${job.name}`, body: "Finished.", level: "success" });
      }
      // One copy scans (a layout could show this mod twice).
      const lease = globalThis.__herdrActionsLease;
      if (lease && lease.id !== this.me && Date.now() - lease.at < SCAN_MS * 3) return;
      globalThis.__herdrActionsLease = { id: this.me, at: Date.now() };
      if (this.scanning) return;
      this.scanning = true;
      try { await this.scan(cx); } catch (e) { this.fail(e, "Actions hooks"); } finally { this.scanning = false; }
      cx.notify();
    });
  }

  async scan(cx) {
    const repos = this.config?.repos ?? {};
    const { raw, data, error } = await readJson(STATE());
    if (error) throw new Error(error);
    const state = data ?? {};
    state.seeded ??= {};
    state.worktrees ??= {};
    const before = JSON.stringify(state);
    const ps = panes();
    const local = spaces().filter((s) => !s.machine);

    for (const [main, repo] of Object.entries(repos)) {
      const acts = repo.actions ?? [];
      const create = acts.filter((a) => a.hook === "create");
      const remove = acts.filter((a) => a.hook === "remove");
      const list = await exec("git", ["worktree", "list", "--porcelain"], { cwd: main }).catch(() => null);
      if (!list || list.code !== 0) continue;
      const live = parseWorktrees(list.stdout).filter((w) => !w.prunable && inside(w.path, WORKTREES()));
      const livePaths = new Set(live.map((w) => w.path));
      // Worktrees that were already there when hooks were first set up for this
      // repo don't get a surprise setup run.
      const seeded = Boolean(state.seeded[main]);

      for (const w of live) {
        const e = (state.worktrees[w.path] ??= { repo: main, setup: seeded ? "pending" : "skipped" });
        e.branch = w.branch ?? e.branch ?? null;
        e.branchDb = branchDbOn(await readTextFile(`${w.path}/.env.local`).catch(() => null));
        if (e.setup !== "pending") continue;
        if (!create.length) { e.setup = "none"; continue; }
        // Wait until it opens in a space (herdr adds the worktree, then the space).
        if (!local.some((s) => { const at = place(s, ps); return at && inside(at, w.path); })) continue;
        e.setup = "started";
        const ctx = { top: w.path, main, name: basename(w.path), branch: e.branch, branchDb: e.branchDb };
        for (const a of create) {
          try { await this.start(a, ctx, cx, { hook: "create" }); }
          catch (err) { this.fail(err, `${a.name}: ${ctx.name}`); }
        }
        notify({ title: `Setting up ${ctx.name}`, body: `${create.map((a) => a.name).join(", ")} started in the Actions panel.`, level: "info" });
      }

      for (const [path, e] of Object.entries(state.worktrees)) {
        if (e.repo !== main || livePaths.has(path)) continue;
        if ((await exec("test", ["-e", path])).code === 0) continue; // not a worktree any more, but still there
        delete state.worktrees[path];
        // Its action terminals (dev server, shell) go with it.
        for (const t of terminals().filter((x) => x.state === "live" && x.labels?.["herdr.action.path"] === path)) {
          await hc(["kill", t.address]).catch(() => null);
        }
        delete this.selected[path];
        keep("selected", this.selected);
        const ctx = { top: path, main, name: basename(path), branch: e.branch, branchDb: e.branchDb };
        for (const a of remove) {
          try { await this.runInBackground(a, ctx); }
          catch (err) { this.fail(err, `${a.name}: ${ctx.name}`); }
        }
      }
      state.seeded[main] = true;
    }
    if (JSON.stringify(state) !== before) await writeJson(STATE(), state, raw);
  }

  // ---- the layout's terminal block ----

  // Points the "actions-term" block at `content` (layout.set writes the layout file,
  // so only when it changes).
  showInBlock(content) {
    const root = layout();
    const node = find(root, "actions-term");
    if (!node || same(node.content, content)) return;
    if (same(this.lastSet, content) && Date.now() - this.lastSetAt < 1500) return;
    this.lastSet = content;
    this.lastSetAt = Date.now();
    const tree = JSON.parse(JSON.stringify(root));
    find(tree, "actions-term").content = content;
    run("layout.set", { layout: tree });
  }

  collapse(on) {
    this.collapsed = on;
    keep("collapsed", on);
    run(on ? "layout.hide" : "layout.show", { id: "actions-term" });
    run("layout.resize", on ? { id: "actions-area", px: HEADER_PX + 2 } : { id: "actions-area", weight: 1 });
  }

  // ---- the panel ----

  openEditor() {
    const ctx = this.ctx;
    if (!ctx) return;
    openOverlay({
      mod: "actions", kind: "dialog", modal: true, width: 680, height: 500,
      props: { editor: true, repo: ctx.main, name: basename(ctx.main), actions: this.actionsFor(ctx.main) },
    });
  }

  iconButton(t, id, icon, tip, onClick, size = 22) {
    return div().id(id).size(size).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
      .tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); })
      .child(svg(ICON(icon)).size(13));
  }

  tab(t, a, ctx, active) {
    const term = termOf(a.id, ctx.top);
    const busy = isBusy(term) || Boolean(this.pending[`${a.id}|${ctx.top}`]);
    return h_flex().id(`tab-${a.id}`).h_full().flex_none().px(8).gap(6).items_center().cursor_pointer()
      .border_b(2).border_color(active ? t.foreground : "#00000000")
      .text_color(active ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .when(a.hook === "create", (el) => el.tooltip("Also runs when a new worktree opens"))
      .on_click((_e, cx) => {
        this.select(ctx.top, a.id);
        if (this.collapsed) this.collapse(false);
        // The plain terminal starts when you open its tab, like a fresh shell.
        if (a === TERMINAL && !term) cx.spawn(async (cx) => { try { await this.start(a, ctx, cx); } catch (e) { this.fail(e); } cx.notify(); });
        cx.notify();
      })
      .child(div().child(a.name))
      .when(busy, (el) => el.child(svg(ICON("spinner")).size(11).text_color(t.working).spin(900)));
  }

  render(cx) {
    if (this.mode === "editor") return this.renderEditor(cx);
    if (this.mode === "placeholder") return this.renderPlaceholder(cx);
    const t = theme();
    const w = this.where();
    if (w.key !== this.ctxKey && !w.remote) this.refreshCtx(cx, w, false);
    if (shared("actions.config") !== this.configStamp) {
      this.configStamp = shared("actions.config");
      cx.spawn(async (cx) => { await this.loadConfig(); cx.notify(); });
    }
    const ctx = w.remote ? null : this.ctx;
    const tabs = ctx ? this.tabsFor(ctx.main) : [];
    const sel = ctx ? this.selectedTab(ctx, tabs) : null;
    const term = sel ? termOf(sel.id, ctx.top) : null;
    const busy = isBusy(term);

    // What the block below shows.
    let message = null;
    if (w.remote) message = "Actions run on this computer only.";
    else if (this.configError) message = this.configError;
    else if (ctx === undefined) message = "";
    else if (ctx === null) message = "Not in a git repository.";
    this.showInBlock(term ? { terminal: term.address }
      : { mod: "actions", props: { placeholder: true, message, id: sel?.id ?? null, name: sel?.name ?? null, repo: ctx ? basename(ctx.main) : null, none: Boolean(ctx) && tabs.length === 1 } });

    const shortcut = (id) => {
      const k = keys().find((k) => new RegExp(`^actions\\.toggle[:\\s-]+${id}$`).test(k.action));
      return k ? k.keys.replace(/cmd/g, "⌘").replace(/shift/g, "⇧").replace(/alt/g, "⌥").replace(/ctrl/g, "⌃").replace(/-/g, "") : "";
    };
    const runnable = sel && sel !== TERMINAL;
    const key = runnable ? shortcut(sel.id) : "";

    return h_flex().id("actions").size_full().pl(6).pr(8).gap(2).items_center().text_size(13)
      .border_b(this.collapsed ? 0 : 1).border_color(t.border)
      .child(this.iconButton(t, "act-collapse", this.collapsed ? "chevron-right" : "chevron-down",
        this.collapsed ? "Show output" : "Hide output", () => this.collapse(!this.collapsed)))
      .child(h_flex().id("act-tabs").h_full().flex_1().min_w(0).gap(2).items_center().overflow_x_scroll()
        .children(ctx ? tabs.map((a) => this.tab(t, a, ctx, a === sel)) : [])
        .when(!ctx, (el) => el.child(div().px(8).text_color(t.dim).child("Actions"))))
      .when(Boolean(runnable), (el) => el.child(
        this.iconButton(t, "act-go", busy ? "stop" : "play",
          `${busy ? "Stop" : term ? "Run again:" : "Run"} ${sel.name}${key ? `  ${key}` : ""}`,
          (cx) => cx.spawn(async (cx) => {
            try { busy ? await this.stop(sel, ctx) : await this.start(sel, ctx, cx); } catch (e) { this.fail(e); }
            cx.notify();
          }), 26)))
      .when(Boolean(ctx), (el) => el.child(this.iconButton(t, "act-edit", "square-pen", "Edit actions", () => this.openEditor(), 26)));
  }

  // ---- the block below, when there's no terminal to show ----

  renderPlaceholder() {
    const t = theme();
    const p = props() ?? {};
    const body = v_flex().size_full().items_center().justify_center().gap(10).p(16).text_size(12.5).text_color(t.dim);
    if (p.message !== null && p.message !== undefined) return body.child(p.message);
    if (p.none) {
      return body.child(`No actions for ${p.repo} yet.`)
        .child(div().id("ph-edit").px(10).h(26).flex().items_center().rounded(6).border(1).border_color(t.border)
          .text_color(t.foreground).hover((s) => s.bg(t.hover)).cursor_pointer()
          .on_click(() => run("actions.edit")).child("Add actions"));
    }
    if (!p.id) return body;
    return body.child(`${p.name} isn't running here.`)
      .child(h_flex().id("ph-run").px(10).h(26).gap(6).items_center().rounded(6).border(1).border_color(t.border)
        .text_color(t.foreground).hover((s) => s.bg(t.hover)).cursor_pointer()
        .on_click(() => run(`actions.run:${p.id}`))
        .child(svg(ICON("play")).size(11)).child(p.id === TERMINAL.id ? "Open a shell" : `Run ${p.name}`));
  }

  // ---- the editor dialog ----

  initEditor(cx) {
    this.rows = [];
    this.saving = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    const acts = props()?.actions ?? [];
    for (const a of acts) this.addRow(a);
    if (!acts.length) this.addRow({});
  }

  addRow(a) {
    const name = InputState.new({ placeholder: "Name", value: a.name ?? "" });
    const command = InputState.new({ placeholder: "Command (runs in the checkout)", value: a.command ?? "" });
    this.rows.push({ key: hex(6), id: a.id ?? null, name, command, hook: a.hook ?? null });
  }

  async save(cx) {
    if (this.saving) return;
    const actions = [];
    const ids = new Set([TERMINAL.id]);
    for (const r of this.rows) {
      const name = r.name.value().trim();
      const command = r.command.value().trim();
      if (!name && !command) continue;
      if (!name || !command) { this.error = "Every action needs a name and a command."; return cx.notify(); }
      const base = r.id || slugify(name) || "action";
      let id = base;
      for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
      ids.add(id);
      actions.push({ id, name, command, hook: r.hook });
    }
    this.saving = true;
    cx.notify();
    try {
      const { raw, data, error } = await readJson(CONFIG());
      if (error) throw new Error(error);
      const config = data ?? {};
      config.repos ??= {};
      const repo = props().repo;
      if (actions.length) config.repos[repo] = { ...(config.repos[repo] ?? {}), actions };
      else delete config.repos[repo];
      await writeJson(CONFIG(), config, raw);
      setShared("actions.config", Date.now());
      closeOverlay(props().overlay);
    } catch (e) {
      this.error = String(e?.message ?? e);
      this.saving = false;
      cx.notify();
    }
  }

  renderEditor() {
    const t = theme();
    const field = (state) => Input.new(state).h(30).px(9).items_center().rounded(6).border(1)
      .border_color(t.input).bg(t.background).text_color(t.foreground);
    const chip = (r, value, label) => div().id(`hook-${r.key}-${value ?? "manual"}`).px(8).h(24).flex().items_center()
      .rounded(5).text_size(11.5).cursor_pointer()
      .when(r.hook === value, (el) => el.bg(t.selected).text_color(t.foreground))
      .when(r.hook !== value, (el) => el.text_color(t.dim).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { r.hook = value; cx.notify(); })
      .child(label);
    const row = (r, i) => v_flex().id(`row-${r.key}`).flex_none().p(10).gap(6).rounded(8).border(1).border_color(t.border).bg(t.surface)
      .child(h_flex().gap(8).items_center()
        .child(div().w(160).flex_none().child(field(r.name)))
        .child(div().flex_1().min_w(0).child(field(r.command)))
        .child(this.iconButton(t, `row-x-${r.key}`, "x", "Delete", (cx) => { this.rows.splice(i, 1); cx.notify(); })))
      .child(h_flex().gap(4).items_center()
        .children(HOOKS.map(([v, l]) => chip(r, v, l)))
        .child(div().flex_1())
        .when(Boolean(r.id), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(`key: actions.toggle:${r.id}`))));

    return v_flex().id("act-editor").track_focus(this.handle).size_full().p(16).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "escape") { cx.stop_propagation(); closeOverlay(props().overlay); }
        else if (e.key === "enter" && (e.modifiers?.platform || e.modifiers?.control)) { cx.stop_propagation(); cx.spawn(async (cx) => this.save(cx)); }
      })
      .child(div().font_semibold().text_color(t.foreground).child(`Actions for ${props().name}`))
      .child(div().text_size(12).text_color(t.muted).child(
        "Manual and On create actions get a tab in the Actions panel. " +
        `On create: also runs the first time a new worktree in ${tilde(WORKTREES())} opens. ` +
        "On remove: runs in the background after one is removed (the folder is gone by then). " +
        "Saved locally in ~/.config/herdr-actions/actions.json."))
      .child(v_flex().id("act-rows").flex_1().min_h(0).gap(8).overflow_y_scrollbar()
        .children(this.rows.map(row))
        .child(h_flex().id("act-row-add").flex_none().h(30).px(8).gap(8).items_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
          .on_click((_e, cx) => { this.addRow({}); cx.notify(); })
          .child(svg(ICON("plus")).size(12)).child("Add action")))
      .when(Boolean(this.error), (el) => el.child(div().text_color(t.blocked).child(this.error)))
      .child(h_flex().gap(8).justify_end().items_center()
        .child(div().flex_1().text_size(11).text_color(t.dim).child("⌘↵ save · esc cancel"))
        .child(div().id("act-cancel").px(12).h(28).flex().items_center().rounded(6).text_color(t.foreground)
          .hover((s) => s.bg(t.hover)).cursor_pointer().on_click(() => closeOverlay(props().overlay)).child("Cancel"))
        .child(div().id("act-save").px(12).h(28).flex().items_center().rounded(6).bg(t.solid).text_color(t.solid_foreground)
          .cursor_pointer().on_click((_e, cx) => cx.spawn(async (cx) => this.save(cx)))
          .child(this.saving ? "Saving…" : "Save")));
  }
}
