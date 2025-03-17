source ~/.bashrc

export PGGSSENCMODE="disable" # Fix Spring SegFault
eval "$(rbenv init -)"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PATH="$HOME/.rbenv/bin:$PATH"
export PATH="/usr/local/bin/rubocop-daemon-wrapper:$PATH"
export PATH="$HOMEBREW_PREFIX/opt/coreutils/libexec/gnubin:$PATH" # coreutils, used by git-quick-stats
export EDITOR="nvim"
export VISUAL="zed"
export DISABLE_SPRING=true
export RUBY_YJIT_ENABLE=1
# export RUBYOPT="--disable=yjit"
# export NVM_DIR=~/.nvm
export BASH_SILENCE_DEPRECATION_WARNING=1

# yarn
alias yt="yarn test"
alias ytw="yarn test-watch"
alias ytwrib="yarn test-watch --runInBand"

# rails aliases
alias rc="be bin/spring rails c"
alias fs="NODE_OPTIONS=--openssl-legacy-provider bundle exec foreman start -f Procfile.dev"
alias fs_no_sidekiq="NODE_OPTIONS=--openssl-legacy-provider bundle exec foreman start -f Procfile.dev all=1,sidekiq_worker=0,sidekiq_serial=0,sidekiq_deducktions=0,sidekiq_data_pipelines_worker=0"
alias fscustom="bundle exec foreman start -f Procfile.ksweetie.dev"
alias wds="env ./bin/webpack-dev-server --profile --progress"
alias be="bundle exec "
alias r="bundle exec rails "
alias ss="bin/spring stop"
alias mig="bundle exec rails db:migrate && bundle exec rails db:test:prepare"
alias rb="bundle exec rails db:rollback:primary"
alias rollback="bundle exec rails db:rollback RAILS_ENV=development; bundle exec rails db:rollback RAILS_ENV=test"
alias spring="bin/spring"
alias rake="bin/rake"
alias taild="tail -f log/development.log"
# spec () { bundle exec bin/rspec $1 ; }
spec () { bundle exec bin/spring rspec $1 ; }
export -f spec

# wunder aliases
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

# misc
ntimes() { for i in `seq $1` ; do $2 ; [[ ! $? = 0 ]] && break ; done }
alias checkports="lsof -wni tcp:3000"
alias dirsize="find . -maxdepth 1 -mindepth 1 -type d -exec du -hs {} \; | sort -hr"
alias kill3001="lsof -n -i4TCP:3001 | grep LISTEN | tr -s ' ' | cut -f 2 -d ' ' | xargs kill -9"
alias volt="~/voltageshift_1.25/voltageshift turbo 0; ~/voltageshift_1.25/voltageshift power 30 60"

# git aliases
alias gs="git status"
alias gpo="git push"
alias gp="git pull"
alias ga="git add -A; git status"
alias gb="git branch"
alias grh="git reset HEAD^"
alias gf="git commit --amend --no-edit"
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset' --abbrev-commit"
alias gdall="git branch -vv | grep 'origin/.*: gone]' | awk '{print $1}' | xargs git branch -d"
alias gcempty="git commit --allow-empty -m 'Empty commit'"
alias gan="git add -N --no-all ."
alias grn="git reset --mixed"
gco() {
  git checkout "$1"
}
gcob() {
  git checkout -b "$1"
}
gc() {
  git commit -m "$1"
}
# gpo() {
#   git push origin "$1"
# }
gfpo() {
  git push origin "$1" --force
}
gd() {
  git branch -d "$1"
}
gD() {
  git branch -D "$1"
}
alias gdi="git branch --no-color | grep -v "master" | fzf -m --layout=reverse | xargs -I {} git branch -d '{}'" # git branch delete interactive
alias gDi="git branch --no-color | grep -v "master" | fzf -m --layout=reverse | xargs -I {} git branch -D '{}'" # git branch delete interactive
showchanged() {
  git diff-tree --no-commit-id --name-only -r "$1"
}
gri() {
  git rebase -i "$1"^
}
gr() {
  git rebase -i HEAD~"$1"
}
apply_diff() {
  FILENAME=temp.patch
  touch $FILENAME
  pbpaste > $FILENAME
  echo "" >> $FILENAME
  git apply $FILENAME
  rm $FILENAME
}

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="${HOMEBREW_PREFIX}/opt/postgresql@16/bin:$PATH"
. "$HOME/.cargo/env"
