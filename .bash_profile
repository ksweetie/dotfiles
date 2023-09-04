source ~/.bashrc

# ~/.bash_profile
eval "$(rbenv init -)"
export PATH="${HOMEBREW_PREFIX}/opt/postgresql@13/bin:$PATH"
export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PATH="$HOME/.rbenv/bin:$PATH"
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/usr/local/bin/rubocop-daemon-wrapper:$PATH"
export EDITOR="nvim"
export DISABLE_SPRING=true
export RUBY_YJIT_ENABLE=1
# export RUBYOPT="--disable=yjit"
# export NVM_DIR=~/.nvm
# export PATH="$PATH:$NVM_BIN"
export BASH_SILENCE_DEPRECATION_WARNING=1

# yarn
alias yt="yarn test"
alias ytw="yarn test-watch"
alias ytwrib="yarn test-watch --runInBand"

# rails aliases
alias rc="be rails c"
alias fs="NODE_OPTIONS=--openssl-legacy-provider bundle exec foreman start -f Procfile.dev"
alias fscustom="bundle exec foreman start -f Procfile.ksweetie.dev"
alias wds="env ./bin/webpack-dev-server --profile --progress"
alias be="bundle exec "
alias ss="bin/spring stop"
alias mig="bundle exec rails db:migrate && bundle exec rails db:test:prepare"
alias rollback="bundle exec rails db:rollback RAILS_ENV=development; bundle exec rails db:rollback RAILS_ENV=test"
alias spring="bin/spring"
alias rake="bin/rake"
alias taild="tail -f log/development.log"
spec () { bundle exec bin/rspec $1 ; }
export -f spec

# wunder aliases
alias prodw="heroku run CONSOLE_USER_EMAIL=kevinsweet@wundercapital.com rails c -a wunder-portal-production -- -- --nomultiline"
alias prodr="heroku run rails c -a wunder-portal-production-read -- -- --nomultiline"
alias prodr_pl="heroku run rails c --size=Performance-L -a wunder-portal-production-read -- -- --nomultiline"
alias prodpsql="heroku pg:psql -a wunder-portal-production-read"
alias stagingconsole="heroku run rails c -a wunder-portal-staging"
alias lint="~/scripts/rbdiff;~/scripts/sldiff;~/scripts/scssdiff;"
alias scrub="rake db:scrub:load_prod_data"

# misc
ntimes() { for i in `seq $1` ; do $2 ; [[ ! $? = 0 ]] && break ; done }
alias checkports="lsof -wni tcp:3000"
alias dirsize="find . -maxdepth 1 -mindepth 1 -type d -exec du -hs {} \; | sort -hr"
alias kill3001="lsof -n -i4TCP:3001 | grep LISTEN | tr -s ' ' | cut -f 2 -d ' ' | xargs kill -9"

# git aliases
alias gs="git status"
alias gp="git pull"
alias ga="git add -A; git status"
alias gb="git branch"
alias grh="git reset HEAD^"
alias gclear="git checkout ."
alias greb="git rebase -i HEAD~2"
alias glp="git log --pretty=oneline"
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %s %Cgreen(%ar) %C(bold blue)<%an>%Creset' --abbrev-commit"
alias gdall="git branch -vv | grep 'origin/.*: gone]' | awk '{print $1}' | xargs git branch -d"
alias gcempty="git commit --allow-empty -m 'Empty commit'"
alias gf="git commit --amend --no-edit"
gco() {
  git checkout "$1"
}
gcob() {
  git checkout -b "$1"
}
gc() {
  git commit -m "$1"
}
gpo() {
  git push origin "$1"
}
gfpo() {
  git push origin "$1" --force
}
gd() {
  git branch -d "$1"
}
gD() {
  git branch -D "$1"
}
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

# powerline
export PATH=$PATH:$HOME/Library/Python/2.7/bin
powerline-daemon -q
POWERLINE_BASH_CONTINUATION=1
POWERLINE_BASH_SELECT=1
. /Users/kevinsweet/Library/Python/2.7/lib/python/site-packages/powerline/bindings/bash/powerline.sh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Android Development
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export ANDROID_AVD_HOME=$HOME/.android/avd
export PATH=/Users/kevinsweet/Library/Android/sdk/platform-tools:$PATH


eval "$(/opt/homebrew/bin/brew shellenv)"
