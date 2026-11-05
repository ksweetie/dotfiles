// Workspaces: one card per space, with that space's agents and their status inside it,
// grouped under the project (git repo, else folder) each space is in. Click a card to switch to the space, click an agent line to jump to that agent,
// right-click a card for the space menu.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agentTitle } from "./label.js";
import { spaces, agents, panes, exec, home, run, theme, shared, setShared, setAgentOrder, openOverlay, layout, window } from "herdr";

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

export default class Workspaces extends View {
  init(_props, cx) {
    this.project = {}; // [machine, folder] -> { key, name } of its repo (or the folder itself)
    this.asking = new Set();
    cx.timer.every(500, (cx) => this.lookUp(cx));
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
        let found = { key, name: cwd === home() ? "~" : base(cwd) };
        try {
          const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on: s.machine ?? undefined });
          const repo = r.code === 0 ? r.stdout.trim() : "";
          if (repo) found = { key: JSON.stringify([s.machine ?? null, repo]), name: repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "") };
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

  card(t, s, mine, fill) {
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
          .when(mine.length === 0, (el) => el.child(div().text_size(11).text_color(t.dim).child(`${s.tabs.length} tab${s.tabs.length === 1 ? "" : "s"}`))),
      )
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
    const item = (s) => (collapsed ? this.rail : this.card).call(this, t, s, bySpace.get(s.id), fillOf(s));
    const items = groups.flatMap((g, i) => [
      collapsed
        ? (i > 0 ? div().flex_none().h(1).mx(8).my(2).bg(t.border) : null)
        : div().flex_none().px(4).pt(i > 0 ? 8 : 2).text_size(11).font_medium().text_color(t.dim).truncate().child(g.name),
      ...g.spaces.map(item),
    ].filter(Boolean));

    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(v_flex().id("ws-list").flex_1().min_h(0).px(collapsed ? 4 : 8).pt(4).pb(12).gap(6)
        .overflow_y_scrollbar().children(items))
      .when(collapsed, (el) => el.child(h_flex().h(28).flex_none().items_center().justify_center()
        .child(div().id("ws-expand").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground))
          .on_click(toggleSidebar).child("»"))));
  }
}
