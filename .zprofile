# Login-only setup for zsh.

# Homebrew environment (sets HOMEBREW_PREFIX and PATH correctly on Apple Silicon).
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
fi

typeset -U path PATH

path_prepend_if_dir() {
  [[ -d "$1" ]] && path=("$1" $path)
}

path_prepend_if_dir "/opt/homebrew/opt/libpq/bin"
path_prepend_if_dir "/opt/homebrew/opt/python@3.10/libexec/bin"
path_prepend_if_dir "/usr/local/bin/rubocop-daemon-wrapper"
[[ -n "${HOMEBREW_PREFIX:-}" ]] && path_prepend_if_dir "${HOMEBREW_PREFIX}/opt/coreutils/libexec/gnubin"
[[ -n "${HOMEBREW_PREFIX:-}" ]] && path_prepend_if_dir "${HOMEBREW_PREFIX}/opt/postgresql@16/bin"
path_prepend_if_dir "$HOME/.rbenv/bin"
path_prepend_if_dir "${ASDF_DATA_DIR:-$HOME/.asdf}/shims"
path_prepend_if_dir "$HOME/.cargo/bin"

unset -f path_prepend_if_dir

export PATH
export PGGSSENCMODE="disable"
export EDITOR="nvim"
export VISUAL="zed"
export DISABLE_SPRING="true"
export RUBY_YJIT_ENABLE="1"
export NVM_DIR="$HOME/.nvm"
