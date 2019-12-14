# ~/.bash_profile
export PATH="/usr/local/opt/postgresql@9.6/bin:$PATH"
export PATH="$HOME/.rbenv/bin:$PATH"
export EDITOR="vim"
export NVM_DIR=~/.nvm
eval "$(rbenv init -)"

#rails aliases
alias fs="bundle exec foreman start -f Procfile.ksweetie.dev"
alias wds="./bin/webpack-dev-server"
alias be="bundle exec "
alias lint="be scss-lint; be slim-lint app/views; be rubocop"
alias respring="bin/spring stop && bin/spring start"
alias spec="bundle exec bin/rspec "
alias rails="bin/rails"
alias spring="bin/spring"
alias rake="bin/rake"

# git aliases
alias gs="git status"
alias gp="git pull"
alias ga="git add -A; git status"
alias gb="git branch"
alias grh="git reset HEAD^"
alias greb="git rebase -i HEAD~2"
alias glp="git log --pretty=oneline"
alias gl="git log --graph --pretty=format:'%Cred%h%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit"
alias gdall="git branch -vv | grep 'origin/.*: gone]' | awk '{print $1}' | xargs git branch -d"
alias gcempty="git commit --allow-empty -m 'Empty commit'"
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


source ~/.aliases
