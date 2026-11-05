// Same file in mods/workspaces, mods/minimal-tabs and mods/minimal-picker (Herdr mods
// cannot import from each other): change one, copy it to the other two.
// What a tab is called everywhere in the minimal layout (sidebar, tab bar, picker):
// the name you gave it, else what its agent says it's working on, else the program.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// An agent's live title, when it says something (not just a folder, host or program name).
export function agentTitle(a) {
  const live = clean(a?.title);
  return live && live !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") ? live : null;
}

// `mine`: the tab's agents. `program`: its first program, for the last fallback.
export function tabLabel(tab, mine = [], program = null) {
  if (tab?.named) return tab.name;
  const titles = mine.map(agentTitle).filter(Boolean);
  if (titles.length) return titles.join(" · ");
  return mine[0]?.program?.name ?? program?.name ?? "Terminal";
}
