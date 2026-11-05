// GitHub pull requests for workspaces, through the `gh` command line tool
// (signed in already). One GraphQL call per branch: the newest PR from it.

import { exec } from "herdr";

// The app may start without Homebrew on its PATH.
const GH = ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"];
let gh = null;

async function run(args, cwd) {
  for (const cmd of gh ? [gh] : GH) {
    try {
      const r = await exec(cmd, args, { cwd });
      gh = cmd;
      return r;
    } catch {}
  }
  return { code: 127, stdout: "", stderr: "gh not found" };
}

const QUERY = `query($owner:String!,$repo:String!,$branch:String!){repository(owner:$owner,name:$repo){
  pullRequests(headRefName:$branch,first:1,orderBy:{field:CREATED_AT,direction:DESC}){nodes{
    number title url state isDraft reviewDecision mergeable
    reviewThreads(first:100){nodes{isResolved}}
    commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}`;

// "owner/repo" of a checkout's origin on GitHub, or null.
const remotes = {};
export async function githubRepo(cwd) {
  if (cwd in remotes) return remotes[cwd];
  const r = await exec("git", ["remote", "get-url", "origin"], { cwd });
  const m = r.code === 0 && r.stdout.trim().match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
  return (remotes[cwd] = m ? { owner: m[1], repo: m[2] } : null);
}

// The branch's newest PR: { number, title, url, state: OPEN|MERGED|CLOSED, draft,
// review: APPROVED|CHANGES_REQUESTED|REVIEW_REQUIRED|null, conflicts, checks:
// SUCCESS|FAILURE|ERROR|PENDING|EXPECTED|null, unresolved }. null: no PR.
// Throws when GitHub couldn't be asked (offline, signed out), so the last answer stays.
export async function pullRequest(cwd, branch) {
  const gr = await githubRepo(cwd);
  if (!gr) return null;
  const r = await run(["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${gr.owner}`, "-F", `repo=${gr.repo}`, "-F", `branch=${branch}`], cwd);
  if (r.code !== 0) throw new Error(r.stderr || "gh failed");
  const pr = JSON.parse(r.stdout)?.data?.repository?.pullRequests?.nodes?.[0];
  if (!pr) return null;
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    draft: pr.isDraft,
    review: pr.reviewDecision ?? null,
    conflicts: pr.mergeable === "CONFLICTING",
    checks: pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
    unresolved: (pr.reviewThreads?.nodes ?? []).filter((t) => !t.isResolved).length,
  };
}
