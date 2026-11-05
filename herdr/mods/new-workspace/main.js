// New workspace from a prompt: pick a repo and a model, describe the work, and
// Create makes a git worktree on a fresh branch, a workspace named after the
// task, and starts the agent there with the prompt as its first message.
// The same mod draws its own pickers (repo, model, effort) as popups: props().menu.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, spaces, panes, exec, home, shared, setShared, pickFolder } from "herdr";

// Branches are named <PREFIX><kebab-name>; checkouts go to <ROOT>/<repo>/<branch, slashes as dashes>.
const BRANCH_PREFIX = "ks/";
const ROOT = () => `${home()}/.herdr/worktrees`;
// The model that names the workspace and branch. Falls back to the prompt's first words.
const NAMER = ["claude", "-p", "--model", "haiku", "--no-session-persistence"];
const NAMER_TIMEOUT = 20000;

const MODELS = [
  { id: "opus", label: "Opus 5.5", argv: ["claude", "--model", "opus"], effort: true },
  { id: "sonnet", label: "Sonnet 5.5", argv: ["claude", "--model", "sonnet"], effort: true },
  { id: "haiku", label: "Haiku 5.5", argv: ["claude", "--model", "haiku"], effort: true },
  { id: "fable", label: "Fable 5.1", argv: ["claude", "--model", "fable"], effort: true },
  { id: "codex", label: "Codex", argv: ["codex"], effort: false },
];
const EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const PREFS = "new-workspace.prefs";
const prefs = () => ({ model: "opus", effort: "high", repo: null, repos: [], ...(shared(PREFS) ?? {}) });
const setPrefs = (p) => setShared(PREFS, { ...prefs(), ...p });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Names for a workspace started without a prompt: "Quiet Otter", ks/quiet-otter.
const ADJECTIVES = ["amber", "brisk", "calm", "clever", "dusty", "eager", "fuzzy", "gentle", "hidden", "jolly", "lucky", "mellow", "nimble", "quiet", "rapid", "rusty", "silent", "sunny", "swift", "tidy", "velvet", "witty"];
const NOUNS = ["badger", "beacon", "comet", "falcon", "fern", "harbor", "heron", "lantern", "maple", "meadow", "otter", "pebble", "pine", "quarry", "raven", "river", "spruce", "summit", "thistle", "walrus", "willow", "wren"];
const any = (list) => list[Math.floor(Math.random() * list.length)];

const slug = (s) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").split("-").slice(0, 6).join("-");

async function git(cwd, args) {
  const r = await exec("git", args, { cwd });
  return { ok: r.code === 0, out: (r.stdout ?? "").trim(), err: (r.stderr || r.stdout || "").trim() };
}

// A folder's repo: its main checkout and name. null outside git.
async function repoOf(folder) {
  if (!folder) return null;
  const common = await git(folder, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common.ok) return null;
  const main = common.out.endsWith("/.git") ? common.out.slice(0, -5) : common.out;
  return { main, name: main.split("/").pop(), git: true };
}

// What the picker offers for a folder: its repo, else the folder itself (no worktree there).
async function entryOf(folder) {
  if (!folder) return null;
  const dir = folder.replace(/\/+$/, "") || "/";
  return (await repoOf(dir)) ?? { main: dir, name: dir === home() ? "~" : dir.split("/").pop(), git: false };
}
const isGit = (r) => r?.git !== false;

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || null;
}

// A promise that gives up: resolves null after ms.
const within = (promise, ms, cx) => Promise.race([promise, new Promise((r) => cx.timer.after(ms, () => r(null)))]);

export default class NewWorkspace extends View {
  init(_props, cx) {
    if (props()?.menu) return;
    this.repos = prefs().repos; // [{ main, name }], last used first
    this.busy = "";
    this.error = "";
    this.text = "";
    this.input = TextareaState.new({ placeholder: "What do you want to work on?" });
    this.input.set_auto_grow(5, 14);
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; cx.notify(); });
    // Only ⌘↵ creates: a submit without ⌘ (seen when switching to another app) is ignored.
    this.input.on("submit", (e, cx) => { if (e?.secondary) this.create(cx); });
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
    // Picked: what you're looking at (the active workspace's repo, or its folder when
    // it isn't one), else the last one used. Nothing shows until it's known, so no flicker.
    this.loading = true;
    cx.spawn(async (cx) => {
      const ps = panes();
      const sp = spaces().filter((s) => !s.machine);
      const active = sp.find((s) => s.active);
      const here = active ? await entryOf(place(active, ps)) : null;
      const last = prefs().repos;
      setPrefs({ repo: here?.main ?? last[0]?.main ?? null });
      this.repos = here ? [here, ...last.filter((r) => r.main !== here.main)] : last;
      this.loading = false;
      cx.notify();
      // Then every open workspace's repo, for the picker.
      for (const s of sp) {
        if (s === active) continue;
        const r = await entryOf(place(s, ps));
        if (r && !this.repos.some((k) => k.main === r.main)) this.repos.push(r);
      }
      if (!prefs().repo && this.repos[0]) setPrefs({ repo: this.repos[0].main });
      cx.notify();
    });
  }

  repo() {
    const main = prefs().repo;
    return this.repos.find((r) => r.main === main) ?? null;
  }

  model() {
    return MODELS.find((m) => m.id === prefs().model) ?? MODELS[0];
  }

  // A picker popup just below the chip pressed (window coordinates).
  menu(kind, at) {
    openOverlay({ mod: "new-workspace", kind: "popup", width: 240, height: 320, at: at ?? "pointer", props: { menu: kind, repos: this.repos } });
  }

  // { name, branch } from the prompt: asked of a quick model, else its first words.
  async names(prompt, cx) {
    if (!prompt) {
      const words = [any(ADJECTIVES), any(NOUNS)];
      return { name: words.map(cap).join(" "), branch: words.join("-") };
    }
    const ask = `Reply with only a JSON object {"name": "...", "branch": "..."}: "name" is a 2-4 word Title Case name for a workspace, "branch" is a short lowercase kebab-case git branch name (no prefix). The task:\n\n${prompt.slice(0, 2000)}`;
    try {
      const r = await within(exec(NAMER[0], [...NAMER.slice(1), ask], { cwd: home() }), NAMER_TIMEOUT, cx);
      const json = r?.code === 0 ? JSON.parse(r.stdout.slice(r.stdout.indexOf("{"), r.stdout.lastIndexOf("}") + 1)) : null;
      if (json?.name && kebab(json.branch ?? "")) return { name: String(json.name).trim().slice(0, 40), branch: kebab(json.branch) };
    } catch {}
    const words = prompt.split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
    return { name: cap(words).slice(0, 40) || "New workspace", branch: kebab(words) || "work" };
  }

  // The branch to start from: the remote's default branch, freshly fetched; else the main checkout's HEAD.
  async base(repo) {
    const head = await git(repo.main, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    if (!head.ok) return "HEAD";
    const branch = head.out.replace(/^origin\//, "");
    await git(repo.main, ["fetch", "--quiet", "origin", branch]);
    return head.out;
  }

  create(cx) {
    const prompt = this.text.trim();
    const repo = this.repo();
    if (this.busy) return;
    if (!repo) { this.error = "Pick a repository first."; return cx.notify(); }
    this.busy = prompt ? "Naming…" : isGit(repo) ? "Creating worktree…" : "Starting…";
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const m = this.model();
        const argv = [...m.argv, ...(m.effort ? ["--effort", prefs().effort] : [])];
        const task = prompt ? { task: prompt } : {};
        // Not a repo: a workspace in that folder, no worktree or branch.
        if (!isGit(repo)) {
          const name = prompt ? (await this.names(prompt, cx)).name : null;
          run("space.new", { ...(name ? { name } : {}), folder: repo.main, machine: "", argv, ...task });
          setPrefs({ repos: [repo, ...this.repos.filter((r) => r.main !== repo.main)].slice(0, 12) });
          return closeOverlay(props().overlay);
        }
        const [names, base] = await Promise.all([this.names(prompt, cx), this.base(repo)]);
        this.busy = "Creating worktree…";
        cx.notify();
        // A free branch and folder: add -2, -3 … if taken.
        let branch, path;
        for (let n = 1; ; n++) {
          branch = `${BRANCH_PREFIX}${names.branch}${n > 1 ? `-${n}` : ""}`;
          path = `${ROOT()}/${repo.name}/${slug(branch)}`;
          const taken = (await git(repo.main, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok
            || (await exec("test", ["-e", path])).code === 0;
          if (!taken) break;
        }
        const add = await git(repo.main, ["worktree", "add", "--no-track", "-b", branch, path, base]);
        if (!add.ok) throw new Error(add.err || "git worktree add failed.");
        run("space.new", { name: names.name, folder: path, machine: "", argv, ...task });
        // Last used repo first next time.
        setPrefs({ repos: [repo, ...this.repos.filter((r) => r.main !== repo.main)].slice(0, 12) });
        closeOverlay(props().overlay);
      } catch (e) {
        this.busy = "";
        this.error = String(e.message ?? e);
        cx.notify();
      }
    });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
    else if (e.key === "enter" && (e.modifiers?.platform || e.modifiers?.control)) { cx.stop_propagation(); this.create(cx); }
  }

  // ---- the picker popups ----

  renderMenu(t) {
    const kind = props().menu;
    const p = prefs();
    const pick = (value) => { setPrefs(value); closeOverlay(props().overlay); };
    const item = (id, label, on, action, detail) => h_flex().id(id).h(30).px(8).gap(9).rounded(7).items_center()
      .text_color(t.foreground).hover((s) => s.bg(t.hover)).cursor_pointer().on_click(action)
      .child(div().flex_1().min_w(0).truncate().child(label))
      .when(Boolean(detail), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(detail)))
      .when(on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none()));
    let title, items;
    if (kind === "model") {
      title = "Model";
      items = MODELS.map((m) => item(`m-${m.id}`, m.label, m.id === p.model, () => pick({ model: m.id })));
    } else if (kind === "effort") {
      title = "Effort";
      items = EFFORTS.map((e) => item(`e-${e}`, cap(e), e === p.effort, () => pick({ effort: e })));
    } else {
      title = "Repository";
      const repos = props().repos ?? [];
      items = [
        ...repos.map((r) => item(`r-${r.main}`, r.name, r.main === p.repo, () => pick({ repo: r.main }), isGit(r) ? r.main.replace(home(), "~").replace(/\/[^/]+$/, "") : "no worktree")),
        item("r-pick", "Choose folder…", false, () => {
          const overlay = props().overlay;
          pickFolder({ prompt: "Use" }).then(async (folder) => {
            const r = await entryOf(folder);
            if (r) setPrefs({ repo: r.main, repos: [r, ...prefs().repos.filter((k) => k.main !== r.main)] });
            closeOverlay(overlay);
          });
        }),
      ];
    }
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child(title))
      .children(items);
  }

  render() {
    const t = theme();
    if (props()?.menu) return this.renderMenu(t);
    const repo = this.repo();
    const m = this.model();
    const chip = (id, children, kind) => h_flex().id(id).h(28).px(8).gap(6).items_center().rounded(7)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        const l = e.local_position, b = e.bounds;
        this.menu(kind, l && b ? { x: e.position.x - l.x, y: e.position.y - l.y + b.height + 4 } : null);
      })
      .children(children);
    const chevron = () => svg("mods/workspace-chrome/chevron-down.svg").size(12).flex_none().text_color(t.dim);
    const ready = !this.busy && repo;
    return v_flex().id("new-workspace").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().text_color(t.foreground).text_size(13)
      // Repo picker.
      .child(h_flex().h(48).px(12).items_center().border_b(1).border_color(t.border)
        .when(this.loading, (el) => el.child(div().h(28)))
        .when(!this.loading, (el) => el.child(chip("nw-repo", [
          h_flex().size(20).rounded(5).bg(t.solid).items_center().justify_center().text_size(11).font_bold().text_color(t.solid_foreground)
            .child((repo?.name ?? "?")[0].toUpperCase()),
          div().text_size(14).font_medium().child(repo?.name ?? "Choose a repository"),
          chevron(),
        ], "repo")))
        .child(div().flex_1())
        .child(div().id("nw-close").size(26).flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Close (Esc)")
          .on_click(() => closeOverlay(props().overlay))
          .child(svg("mods/workspace-chrome/x.svg").size(14))))
      // The prompt.
      .child(div().px(20).pt(14).pb(8)
        .child(Textarea.new(this.input).w_full().text_size(14).text_color(t.foreground)))
      .when(Boolean(this.error), (el) => el.child(div().px(20).pb(4).text_size(12).text_color(t.blocked).child(this.error)))
      // Model, effort, Create.
      .child(h_flex().h(52).px(12).gap(2).items_center()
        .child(chip("nw-model", [div().font_medium().child(m.label), ...(m.effort ? [] : [chevron()])], "model"))
        .when(m.effort, (el) => el.child(chip("nw-effort", [div().text_color(t.muted).child(cap(prefs().effort)), chevron()], "effort")))
        .child(div().flex_1())
        .when(Boolean(this.busy), (el) => el.child(h_flex().gap(7).pr(10).items_center().text_size(12).text_color(t.muted)
          .child(svg("mods/workspace-chrome/spinner.svg").size(12).text_color(t.working).spin(900))
          .child(this.busy)))
        .child(h_flex().id("nw-create").h(30).px(12).gap(8).items_center().rounded(7)
          .bg(t.solid).text_color(t.solid_foreground).font_medium()
          .when(!ready, (el) => el.opacity(0.5))
          .when(Boolean(ready), (el) => el.cursor_pointer().hover((s) => s.opacity(0.88)))
          .on_click((_e, cx) => this.create(cx))
          .child("Create").child(div().text_size(12).child("⌘↵"))));
  }
}
