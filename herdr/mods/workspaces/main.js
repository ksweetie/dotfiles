// Workspaces: one card per space, with that space's agents and their status inside it,
// grouped under the project (git repo, else folder) each space is in. Click a card to switch to the space, click an agent line to jump to that agent,
// right-click a card for the space menu. Each card shows its branch's GitHub PR
// (state, checks, unresolved comments, conflicts); a merged PR archives the
// workspace: it closes, its folder and branch stay, and the archived list
// (mods/archived) reopens it.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agentTitle } from "./label.js";
import { pullRequest } from "./github.js";
import { spaces, agents, panes, exec, home, run, theme, shared, setShared, setAgentOrder, openOverlay, layout, window, notify } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Same avatar colors as the shipped Spaces list, so a space keeps its color.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Where a space is now: its first terminal's live folder, else where it was made.
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder || home();
}
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
const TRUNK = new Set(["main", "master", "develop", "trunk"]);
const PR_EVERY = 60000; // how often each branch's PR is asked for

// Archived workspaces, newest first: { folder, name, named, branch, project, pr, at }.
// Shared with mods/archived, saved in shared.json.
const ARCHIVED = "workspaces.archived";
// PR urls whose workspace was reopened after merging: never archived by itself again.
const KEEP = "workspaces.keep";

export default class Workspaces extends View {
  init(_props, cx) {
    this.project = {}; // [machine, folder] -> { key, name } of its repo (or the folder itself)
    this.asking = new Set();
    this.pr = {}; // "top|branch" -> its PR, null: none
    this.prAt = {}; // "top|branch" -> when last asked
    this.prAsking = new Set();
    this.hovered = null; // space id under the pointer, for its archive button
    cx.timer.every(500, (cx) => this.lookUp(cx));
    cx.timer.every(5000, (cx) => this.pollPRs(cx));
    this.lookUp(cx);
  }

  // Ask git which repo each space's folder belongs to (worktrees name their main repo).
  lookUp(cx) {
    const ps = panes();
    for (const s of spaces()) {
      const cwd = place(s, ps);
      const key = JSON.stringify([s.machine ?? null, cwd]);
      if (this.project[key] || this.asking.has(key)) continue;
      this.asking.add(key);
      cx.spawn(async (cx) => {
        let found = { key, name: cwd === home() ? "~" : base(cwd), top: null };
        try {
          const on = s.machine ?? undefined;
          const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"], { cwd, on });
          const [repo, top] = r.code === 0 ? r.stdout.trim().split("\n") : [];
          if (repo) found = { key: JSON.stringify([s.machine ?? null, repo]), name: repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, ""), top };
        } catch {}
        this.project[key] = found;
        this.asking.delete(key);
        cx.notify();
      });
    }
  }

  projectOf(s, ps) {
    const cwd = place(s, ps);
    return this.project[JSON.stringify([s.machine ?? null, cwd])] ?? { key: "…", name: "" };
  }

  // The PR of a space's branch (local spaces off the trunk only): [key, pr].
  prKey(s, ps) {
    if (s.machine || !s.branch || TRUNK.has(s.branch)) return null;
    const top = this.projectOf(s, ps).top;
    return top ? `${top}|${s.branch}` : null;
  }

  pollPRs(cx) {
    const ps = panes();
    const now = Date.now();
    for (const s of spaces()) {
      const key = this.prKey(s, ps);
      if (!key || this.prAsking.has(key) || now - (this.prAt[key] ?? 0) < PR_EVERY) continue;
      this.prAsking.add(key);
      const [top, branch] = [key.slice(0, key.indexOf("|")), s.branch];
      cx.spawn(async (cx) => {
        try { this.pr[key] = await pullRequest(top, branch); } catch {} // offline: keep the last answer
        this.prAt[key] = Date.now();
        this.prAsking.delete(key);
        this.autoArchive(s.id);
        cx.notify();
      });
    }
  }

  // A merged PR archives its workspace, unless an agent there is busy or waiting on you
  // (it's tried again on the next look) or you reopened it after the merge.
  autoArchive(id) {
    const s = spaces().find((x) => x.id === id);
    const pr = s && this.pr[this.prKey(s, panes())];
    if (pr?.state !== "MERGED" || (shared(KEEP) ?? []).includes(pr.url)) return;
    if (agents().some((a) => a.space === id && (a.status === "working" || a.status === "blocked"))) return;
    this.archive(s, `PR #${pr.number} merged`);
  }

  archive(s, why) {
    const ps = panes();
    const proj = this.projectOf(s, ps);
    const pr = this.pr[this.prKey(s, ps)] ?? null;
    const folder = proj.top ?? place(s, ps);
    const record = { folder, name: s.name, named: s.named, branch: s.branch ?? null, project: proj.name || base(folder),
      pr: pr && { number: pr.number, title: pr.title, url: pr.url, state: pr.state }, at: Date.now() };
    setShared(ARCHIVED, [record, ...(shared(ARCHIVED) ?? []).filter((r) => r.folder !== folder)]);
    run("space.close", { id: s.id, confirmed: true });
    notify({ title: `Archived ${s.name}`, body: why ? `${why}. Its folder and branch are kept.` : "Its folder and branch are kept.",
      action: { name: "mod.open", args: { name: "archived" } } });
  }

  prLine(t, pr) {
    const bits = [];
    const state = pr.state === "MERGED" ? ["Merged", t.ansi5] : pr.state === "CLOSED" ? ["Closed", t.dim]
      : pr.draft ? ["Draft", t.dim] : pr.review === "APPROVED" ? ["Approved", t.ansi2]
      : pr.review === "CHANGES_REQUESTED" ? ["Changes requested", t.blocked] : ["Open", t.muted];
    bits.push(div().flex_none().text_color(state[1]).child(state[0]));
    if (pr.state === "OPEN") {
      const c = pr.checks;
      if (c === "SUCCESS") bits.push(div().flex_none().text_color(t.ansi2).child("✓ checks"));
      else if (c === "FAILURE" || c === "ERROR") bits.push(div().flex_none().text_color(t.ansi1).child("✗ checks"));
      else if (c === "PENDING" || c === "EXPECTED") bits.push(div().flex_none().text_color(t.working).child("● checks"));
      if (pr.unresolved) bits.push(div().flex_none().text_color(t.foreground).child(`${pr.unresolved} unresolved`));
      if (pr.conflicts) bits.push(div().flex_none().text_color(t.blocked).child("conflicts"));
    }
    return h_flex().gap(6).items_center().text_size(11).min_w(0).overflow_hidden()
      .child(div().id(`ws-pr-${pr.number}`).flex_none().text_color(t.dim).hover((st) => st.text_color(t.accent)).cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); exec("open", [pr.url]); }).child(`#${pr.number}`))
      .children(bits);
  }

  status(t, s, compact = false) {
    if (s === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (s === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (s === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (s === "done") return div().size(7).mx(3).flex_none().rounded(4).bg(t.done);
    if (s === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none();
  }

  // Keep every space's avatar color (shared with the shipped Spaces list).
  colors(sp) {
    const all = shared("space.colors") ?? {};
    const ids = new Set(sp.map((s) => s.id));
    const kept = Object.fromEntries(Object.entries(all).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(all).length;
    for (const s of sp) {
      if (kept[s.id] || s.name === "~") continue;
      const uses = (c) => Object.values(kept).filter((v) => v === c).length;
      kept[s.id] = PALETTE.reduce((best, c) => (uses(c) < uses(best) ? c : best));
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return kept;
  }

  // One line per agent: same rule as tabLabel (label.js), per agent.
  agentLabel(a, tab) {
    if (tab?.named) return tab.name;
    return agentTitle(a) ?? (a.program?.name || a.address);
  }

  agentLine(t, a, tab) {
    const pic = icon(a.program, 14, t.foreground);
    const quiet = a.status === "idle" && !a.focused;
    return h_flex()
      .id(`ws-ag-${a.address}`)
      .h(24)
      .pl(6)
      .pr(4)
      .gap(7)
      .items_center()
      .rounded(6)
      .text_size(12.5)
      .when(a.focused, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run("pane.focus", { pane: a.pane });
      })
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_1().min_w(0).truncate().text_color(quiet ? t.muted : t.foreground).child(this.agentLabel(a, tab)))
      .child(this.status(t, a.status, true));
  }

  card(t, s, mine, fill, pr) {
    const tabs = new Map(s.tabs.map((tab) => [tab.id, tab]));
    const branch = s.branch && s.branch !== "main" && s.branch !== "master" && s.branch !== s.name ? s.branch : null;
    return v_flex()
      .id(`ws-${s.id}`)
      .flex_none()
      .p(8)
      .gap(4)
      .rounded(10)
      .border(1)
      .border_color(s.active ? t.input : t.border)
      .bg(s.active ? t.selected : t.surface)
      .when(!s.active, (el) => el.hover((st) => st.bg(t.hover)))
      .cursor_pointer()
      .on_hover((over, cx) => { this.hovered = over ? s.id : this.hovered === s.id ? null : this.hovered; cx.notify(); })
      .on_click(() => run("space.select", { id: s.id }))
      .on_mouse_down("right", () =>
        openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }))
      .child(
        h_flex().gap(9).items_center()
          .child(h_flex().size(20).flex_none().rounded(5).bg(fill).items_center().justify_center()
            .text_size(11).font_bold().text_color("#ffffff").child([...s.name][0]?.toUpperCase() ?? "?"))
          .child(v_flex().flex_1().min_w(0)
            .child(div().truncate().font_medium().text_color(t.foreground).child(s.name))
            .when(Boolean(branch), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(branch))))
          .when(mine.length === 0 && this.hovered !== s.id, (el) => el.child(div().text_size(11).text_color(t.dim).child(`${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`)))
          .when(this.hovered === s.id, (el) => el.child(div().id(`ws-archive-${s.id}`).size(20).flex_none().flex().items_center().justify_center()
            .rounded(5).text_color(t.dim).hover((st) => st.bg(t.hover).text_color(t.foreground)).tooltip("Archive")
            .on_click((_e, cx) => { cx.stop_propagation(); this.archive(s, ""); })
            .child(svg("mods/workspaces/archive.svg").size(13)))),
      )
      .when(Boolean(pr), (el) => el.child(div().pl(29).child(this.prLine(t, pr))))
      .when(mine.length > 0, (el) =>
        el.child(v_flex().pl(20).gap(1).children(mine.map((a) => this.agentLine(t, a, tabs.get(a.tab))))));
  }

  rail(t, s, mine, fill) {
    const top = mine.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
    return v_flex()
      .id(`ws-${s.id}`)
      .flex_none()
      .py(5)
      .gap(4)
      .items_center()
      .rounded(8)
      .when(s.active, (el) => el.bg(t.selected))
      .hover((st) => st.bg(t.hover))
      .on_click(() => run("space.select", { id: s.id }))
      .child(h_flex().size(22).rounded(6).bg(fill).items_center().justify_center()
        .text_size(11).font_bold().text_color("#ffffff").child([...s.name][0]?.toUpperCase() ?? "?"))
      .when(Boolean(top), (el) => el.child(this.status(t, top, true)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const ps = panes();
    const all = agents();
    const kept = this.colors(spaces());
    // Spaces grouped by project, projects in order of their first space.
    const groups = [];
    for (const s of spaces()) {
      const p = this.projectOf(s, ps);
      let g = groups.find((x) => x.key === p.key);
      if (!g) groups.push((g = { key: p.key, name: p.name, spaces: [] }));
      g.spaces.push(s);
    }
    const sp = groups.flatMap((g) => g.spaces);
    // Agent navigation follows the sidebar: space by space, top to bottom.
    const bySpace = new Map(sp.map((s) => [s.id, all.filter((a) => a.space === s.id)]));
    setAgentOrder(sp.flatMap((s) => bySpace.get(s.id).map((a) => a.address)));
    const fillOf = (s) => {
      const c = kept[s.id] ?? "ansi6";
      return c.startsWith("#") ? c : (MARK[c] ?? t[c]);
    };
    const item = (s) => collapsed ? this.rail(t, s, bySpace.get(s.id), fillOf(s))
      : this.card(t, s, bySpace.get(s.id), fillOf(s), this.pr[this.prKey(s, ps)]);
    const items = groups.flatMap((g, i) => [
      collapsed
        ? (i > 0 ? div().flex_none().h(1).mx(8).my(2).bg(t.border) : null)
        : div().flex_none().px(4).pt(i > 0 ? 8 : 2).text_size(11).font_medium().text_color(t.dim).truncate().child(g.name),
      ...g.spaces.map(item),
    ].filter(Boolean));

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(v_flex().id("ws-list").flex_1().min_h(0).px(collapsed ? 4 : 8).pt(4).pb(12).gap(6)
        .overflow_y_scrollbar().children(items))
      .when(!collapsed, (el) => el.child(h_flex().id("ws-archived").h(30).flex_none().mx(8).mb(8).px(8).gap(8).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover((st) => st.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(() => run("mod.open", { name: "archived" }))
        .child(svg("mods/workspaces/archive.svg").size(13)).child("Archived")))
      .when(collapsed, (el) => el.child(h_flex().h(28).flex_none().items_center().justify_center()
        .child(div().id("ws-expand").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_click(toggleSidebar).child("»"))));
  }
}
