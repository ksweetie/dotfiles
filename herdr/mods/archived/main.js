// Archived workspaces: the ones the Workspaces sidebar closed (by hand, or when
// their PR merged), plus worktrees under ~/.herdr/worktrees with no open workspace.
// Their folders and branches are still on disk. Type to search; click (or Enter on
// the first) to reopen one as a workspace, with Claude resuming its last conversation.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, panes, home, shared, setShared, exec } from "herdr";

const ARCHIVED = "workspaces.archived"; // written by mods/workspaces
const KEEP = "workspaces.keep";
const ROOT = `${home()}/.herdr/worktrees`;
const RESUME = ["claude", "--continue"];

const base = (path) => path.replace(/\/+$/, "").split("/").pop();
const exists = async (p) => { try { return (await exec("test", ["-e", p])).code === 0; } catch { return false; } };

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} day${d === 1 ? "" : "s"} ago` : new Date(ms).toLocaleDateString();
}

export default class Archived extends View {
  init(_props, cx) {
    this.filter = "";
    this.items = null; // null: still looking
    this.input = InputState.new({ placeholder: "Search archived workspaces…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
    cx.spawn(async (cx) => { this.items = await this.gather(); cx.notify(); });
  }

  // Folders some open workspace is in now.
  openFolders() {
    const ps = panes();
    return spaces().filter((s) => !s.machine).flatMap((s) => {
      const tabs = new Set(s.tabs.map((t) => t.id));
      return ps.filter((p) => tabs.has(p.tab) && p.cwd).map((p) => p.cwd);
    });
  }

  async gather() {
    const open = this.openFolders();
    const isOpen = (f) => open.some((c) => c === f || c.startsWith(f + "/"));
    const records = [];
    for (const r of shared(ARCHIVED) ?? []) if (!isOpen(r.folder) && (await exists(r.folder))) records.push(r);
    // Forget archived folders that were deleted or reopened some other way.
    if (records.length !== (shared(ARCHIVED) ?? []).length) setShared(ARCHIVED, records);
    const known = new Set(records.map((r) => r.folder));
    const loose = [];
    // Checkouts are ~/.herdr/worktrees/<repo>/<branch>/ (a .git file marks each).
    try {
      const r = await exec("find", [ROOT, "-mindepth", "3", "-maxdepth", "3", "-name", ".git"]);
      for (const line of r.stdout.split("\n").filter(Boolean)) {
        const folder = line.slice(0, -"/.git".length);
        if (known.has(folder) || isOpen(folder)) continue;
        const st = await exec("stat", ["-f", "%m", folder]);
        const br = await exec("git", ["branch", "--show-current"], { cwd: folder });
        loose.push({ folder, name: base(folder), named: false, branch: br.stdout.trim() || null, project: base(folder.slice(0, -base(folder).length - 1)),
          pr: null, at: (parseInt(st.stdout, 10) || 0) * 1000, loose: true });
      }
    } catch {}
    return [...records, ...loose.sort((a, b) => b.at - a.at)];
  }

  shown() {
    const f = this.filter.trim().toLowerCase();
    return (this.items ?? []).filter((r) => !f ||
      [r.name, r.project, r.branch, r.pr?.title, r.pr && `#${r.pr.number}`].filter(Boolean).join(" ").toLowerCase().includes(f));
  }

  reopen(r) {
    if (!r) return;
    if (r.pr?.state === "MERGED") setShared(KEEP, [...new Set([...(shared(KEEP) ?? []), r.pr.url])].slice(-200));
    setShared(ARCHIVED, (shared(ARCHIVED) ?? []).filter((x) => x.folder !== r.folder));
    run("space.new", { ...(r.named ? { name: r.name } : {}), folder: r.folder, machine: "", argv: RESUME });
    closeOverlay(props().overlay);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
    else if (e.key === "enter") { this.reopen(this.shown()[0]); cx.stop_propagation(); }
  }

  row(t, r, i) {
    const sub = [r.project, r.branch, r.pr && `#${r.pr.number} ${r.pr.state === "MERGED" ? "merged" : r.pr.state.toLowerCase()}`]
      .filter(Boolean).join(" · ");
    return h_flex().id(`ar-${i}`).px(10).py(7).gap(10).items_center().rounded(8).cursor_pointer()
      .when(i === 0 && this.filter, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.reopen(r))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).text_color(t.foreground).child(r.name))
        .child(div().truncate().text_size(11).text_color(t.dim).child(sub || base(r.folder))))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(r.at ? ago(r.at) : ""));
  }

  render() {
    const t = theme();
    const list = this.shown();
    return v_flex().id("archived").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(18).gap(12).text_size(13)
      .child(h_flex().items_center().justify_between()
        .child(div().text_size(16).font_semibold().text_color(t.foreground).child("Archived workspaces"))
        .child(div().id("ar-close").size(26).flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Close (Esc)")
          .on_click(() => closeOverlay(props().overlay)).child(svg("mods/workspace-chrome/x.svg").size(14))))
      .child(h_flex().h(36).px(10).gap(8).items_center().rounded(8).border(1).border_color(t.input)
        .child(svg("mods/minimal-chrome/search.svg").size(14).text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .child(v_flex().id("ar-list").flex_1().min_h(0).gap(2).overflow_y_scrollbar()
        .when(this.items === null, (el) => el.child(div().p(10).text_color(t.dim).child("Looking…")))
        .when(this.items !== null && list.length === 0, (el) => el.child(div().p(10).text_color(t.dim)
          .child(this.filter ? "Nothing matches." : "Nothing archived. Workspaces whose PR merges land here.")))
        .children(list.map((r, i) => this.row(t, r, i))))
      .child(div().text_size(11).text_color(t.dim).child("Reopening starts Claude with its last conversation in that folder."));
  }
}
