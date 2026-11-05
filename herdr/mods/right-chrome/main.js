// The right column's top bar: Files and Changes (the upper panel, remembered per
// space by minimal-tabs) and a toggle that closes the whole right column.
// minimal-tabs shows the toggle that opens it again.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { run, theme, shared, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export default class RightChrome extends View {
  render() {
    const t = theme();
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    const stop = (_e, cx) => cx.stop_propagation();
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14)).child(label);
    };
    return h_flex().size_full().px(10).gap(3).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().id("right-toggle").size(26).flex_none().flex().items_center().justify_center().rounded(6)
        .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Close right panel")
        .on_mouse_down("left", stop).on_click(() => run("layout.hide", { id: "right" }))
        .child(svg("mods/minimal-chrome/panel-right.svg").size(15)))
      .child(div().flex_1())
      .when(enabled.includes("files"), (el) => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), (el) => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")));
  }
}
