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
[[ -n "${HOMEBREW_PREFIX:-}" ]] && path_prepend_if_dir "${HOMEBREW_PREFIX}/opt/coreutils/libexec/gnubin"
[[ -n "${HOMEBREW_PREFIX:-}" ]] && path_prepend_if_dir "${HOMEBREW_PREFIX}/opt/postgresql@16/bin"
path_prepend_if_dir "$HOME/.cargo/bin"
# Last so mise-managed tools win over Homebrew copies (see .zshenv).
path_prepend_if_dir "$HOME/.local/share/mise/shims"

unset -f path_prepend_if_dir

export PATH
export PGGSSENCMODE="disable"
export EDITOR="nvim"
export VISUAL="zed"
export DISABLE_SPRING="true"
