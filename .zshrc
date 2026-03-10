# Balanced interactive zsh profile: fast startup with useful UX upgrades.

[[ $- != *i* ]] && return

typeset -U path PATH fpath

setopt AUTO_CD
setopt INTERACTIVE_COMMENTS
setopt EXTENDED_GLOB
setopt HIST_IGNORE_ALL_DUPS
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt HIST_REDUCE_BLANKS
setopt HIST_FIND_NO_DUPS
setopt INC_APPEND_HISTORY
setopt SHARE_HISTORY
setopt NO_BEEP

HISTFILE="$HOME/.zsh_history"
HISTSIZE=100000
SAVEHIST=100000

zmodload zsh/complist
autoload -Uz compinit
_zcomp_cache="${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
mkdir -p "$_zcomp_cache"
compinit -C -d "${_zcomp_cache}/.zcompdump-${ZSH_VERSION}"
unset _zcomp_cache

zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}' 'r:|=*' 'l:|=*'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path "${XDG_CACHE_HOME:-$HOME/.cache}/zsh"
zstyle ':completion:*:descriptions' format '[%d]'
zstyle ':completion:*' squeeze-slashes true
zstyle ':completion:*' special-dirs true
zstyle ':completion:*' rehash true
zstyle ':completion:*:default' list-prompt '%S%M matches%s'

bindkey -e
bindkey '^[[A' up-line-or-search
bindkey '^[[B' down-line-or-search
bindkey '^P' up-line-or-search
bindkey '^N' down-line-or-search
bindkey '^[[H' beginning-of-line
bindkey '^[[F' end-of-line
bindkey '^[[3~' delete-char

# Optional UX integrations. These are loaded only when installed.
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init zsh --cmd z)"
fi

if [[ "${TERM:-}" != "dumb" ]]; then
  if [[ -f /opt/homebrew/opt/fzf/shell/completion.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/completion.zsh
  fi
  if [[ -f /opt/homebrew/opt/fzf/shell/key-bindings.zsh ]]; then
    source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
  fi

  if [[ -f /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
    source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh
  fi
  if [[ -f /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
    source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
  fi
fi

if command -v rbenv >/dev/null 2>&1; then
  path=("$HOME/.rbenv/shims" $path)
fi

_load_nvm() {
  unset -f nvm node npm npx yarn pnpm corepack _load_nvm
  [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
}

nvm() { _load_nvm; nvm "$@"; }
node() { _load_nvm; node "$@"; }
npm() { _load_nvm; npm "$@"; }
npx() { _load_nvm; npx "$@"; }
yarn() { _load_nvm; yarn "$@"; }
pnpm() { _load_nvm; pnpm "$@"; }
corepack() { _load_nvm; corepack "$@"; }

if command -v eza >/dev/null 2>&1; then
  alias l="eza -la --group-directories-first --icons=auto"
else
  alias l="ls -lahG"
fi
command -v bat >/dev/null 2>&1 && alias cat="bat --style=plain --paging=never"
alias vim="nvim"
command -v fd >/dev/null 2>&1 && alias find="fd"
alias c="cd"
alias reload="exec zsh -l"

# Yarn
alias yt="yarn test"
alias ytw="yarn test-watch"
alias ytwrib="yarn test-watch --runInBand"

# Rails
alias rc="be bin/spring rails c"
alias fs="NODE_OPTIONS=--openssl-legacy-provider bundle exec foreman start -f Procfile.dev"
alias fs_no_sidekiq="NODE_OPTIONS=--openssl-legacy-provider bundle exec foreman start -f Procfile.dev all=1,sidekiq_worker=0,sidekiq_serial=0,sidekiq_deducktions=0,sidekiq_data_pipelines_worker=0"
alias fscustom="bundle exec foreman start -f Procfile.ksweetie.dev"
alias wds="env ./bin/webpack-dev-server --profile --progress"
alias be="bundle exec"
alias r="bundle exec rails"
alias ss="bin/spring stop"
alias mig="bundle exec rails db:migrate && bundle exec rails db:test:prepare"
alias rb="bundle exec rails db:rollback:primary"
alias rollback="bundle exec rails db:rollback RAILS_ENV=development; bundle exec rails db:rollback RAILS_ENV=test"
alias spring="bin/spring"
alias rake="bin/rake"
alias taild="tail -f log/development.log"
spec() { bundle exec bin/spring rspec "$@"; }

# Wunder
alias prodr="heroku run \"CONSOLE_USER_EMAIL=kevinsweet@wundercapital.com RAILS_ENV=read_only SKIP_SANITY_CHECK=true rails c -- --nomultiline\" --size=Performance-L -a wunder-portal-production"
alias prodw="heroku run \"CONSOLE_USER_EMAIL=kevinsweet@wundercapital.com rails c -- --nomultiline\" --size=Performance-L -a wunder-portal-production"
alias prodw_db_pool="heroku run \"DB_POOL=11 CONSOLE_USER_EMAIL=kevinsweet@wundercapital.com rails c -- --nomultiline\" --size=Performance-L -a wunder-portal-production"
alias prodpsql="heroku pg:psql -a wunder-portal-production"
alias preboot_on="heroku features:enable preboot -a wunder-portal-production"
alias preboot_off="heroku features:disable preboot -a wunder-portal-production"
alias preboot_check="heroku features -a wunder-portal-production"
alias stagingconsole="heroku run rails c -a wunder-portal-staging"
alias lint="~/scripts/rbdiff;~/scripts/sldiff;~/scripts/scssdiff;"
alias scrub="rake db:scrub:load_prod_data"
alias mydbcleanup='psql --list | grep -v "wunder_portal" | grep -E "branch_ks_" | cut -d " " -f 2 | xargs -t -n 1 dropdb'
alias dbcleanup='psql --list | grep -v "wunder_portal" | grep -E "branch_(ai|aq|bb|bj|ep|head)_" | cut -d " " -f 2 | xargs -p -t -n 1 dropdb'

# Misc
alias checkports="lsof -wni tcp:3000"
alias dirsize="find . -maxdepth 1 -mindepth 1 -type d -exec du -hs {} \\; | sort -hr"
alias kill3001="lsof -n -i4TCP:3001 | grep LISTEN | tr -s ' ' | cut -f 2 -d ' ' | xargs kill -9"
alias volt="~/voltageshift_1.25/voltageshift turbo 0; ~/voltageshift_1.25/voltageshift power 30 60"
alias godot="/Applications/Godot.app/Contents/MacOS/Godot"

ntimes() {
  local count="$1"
  shift
  local i
  for ((i = 1; i <= count; i++)); do
    "$@" || return $?
  done
}

# Git
alias gs="git status"
alias gpo="git push"
alias gp="git pull"
alias ga="git add -A; git status"
alias gb="git branch"
alias grh="git reset 'HEAD^'"
alias gf="git commit --amend --no-edit"
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset' --abbrev-commit"
alias gci="git branch --format='%(refname:short)' | gum choose --height=20 | xargs git checkout"
alias gdall="git branch -vv | grep 'origin/.*: gone]' | awk '{print \$1}' | xargs git branch -d"
alias gcempty="git commit --allow-empty -m 'Empty commit'"
alias gan="git add -N --no-all ."
alias grn="git reset --mixed"

gco() { git checkout "$1"; }
gcoo() { git checkout "origin/$1"; }
gcob() { git checkout -b "$1"; }

gm() {
  local target=$(git branch --list --format='%(refname:short)' main master | head -n1)
  local current=$(git branch --show-current)
  if [[ "$current" == "$target" ]]; then
    echo "Already on $target"
  else
    git checkout "$target"
  fi
}

gc() {
  git commit -m "$(gum input --width 50 --placeholder 'Summary of changes')" \
             -m "$(gum write --width 80 --placeholder 'Details of changes')"
}

gfpo() { git push origin "$1" --force; }
gd() { git branch -d "$1"; }
gD() { git branch -D "$1"; }

gdi() {
  local selection=$(git branch --format='%(if)%(worktreepath)%(then)+ %(else)  %(end)%(refname:short)' |
    grep -v -e 'master$' -e 'main$' |
    gum choose --height=20 --no-limit --header "Select to delete ( + = Worktree )")

  if [[ -z "$selection" ]]; then
    echo "No selection made."
    return 0
  fi

  local line branch wt_path
  while IFS= read -r line; do
    branch=$(echo "$line" | sed 's/^[+ ]*//')

    if [[ "$line" == "+"* ]]; then
      wt_path=$(git worktree list --porcelain | grep -B 2 "branch refs/heads/$branch" | grep "^worktree" | cut -d' ' -f2)
      if [[ -n "$wt_path" ]]; then
        echo "Removing worktree at $wt_path..."
        git worktree remove "$wt_path"
      fi
    fi

    git branch -D "$branch"
  done <<< "$selection"
}

gDi() {
  git branch --format='%(refname:short)' | grep -v -e '^master$' -e '^main$' | gum choose --height=20 --no-limit | xargs git branch -D
}

gwt() {
  local branch=$1
  local base=${2:-master}
  if [[ -z "$branch" ]]; then
    echo "Usage: gwt <branch-name> [base-ref]"
    return 1
  fi
  git worktree add "../$branch" -b "$branch" "$base"
  cd "../$branch"
}

showchanged() { git diff-tree --no-commit-id --name-only -r "$1"; }
gri() { git rebase -i "$1"^; }
gr() { git rebase -i "HEAD~$1"; }

apply_diff() {
  local filename
  filename="$(mktemp -t git-apply.XXXXXX.patch)"
  pbpaste >"$filename" || return 1
  printf '\n' >>"$filename"
  git apply "$filename"
  rm -f "$filename"
}

if [[ -f "$HOME/.zshrc.local" ]]; then
  source "$HOME/.zshrc.local"
fi

# Ghostty shell integration
if [[ -n "${GHOSTTY_RESOURCES_DIR}" ]]; then
  source "${GHOSTTY_RESOURCES_DIR}/shell-integration/zsh/ghostty-integration"
fi

if [[ "${TERM:-}" != "dumb" ]] && command -v starship >/dev/null 2>&1; then
  eval "$(starship init zsh)"
fi
export PATH="$HOME/.local/bin:$PATH"
