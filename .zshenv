# Keep .zshenv minimal: it is sourced by every zsh invocation.
# PATH entries here cover non-login shells (agents, scripts). Login shells re-run
# path_helper and `brew shellenv`, which push these back, so .zprofile re-prepends them.
path=("$HOME/.local/share/mise/shims" "$HOME/.cargo/bin" $path)
[[ -d "$HOME/go/bin" ]] && path+=("$HOME/go/bin")

# Homebrew's CA bundle gets distrust fixes faster than macOS's /etc/ssl/cert.pem.
[[ -r /opt/homebrew/etc/ca-certificates/cert.pem ]] && export SSL_CERT_FILE=/opt/homebrew/etc/ca-certificates/cert.pem

[[ -r ~/.config/zsh/secrets.zsh ]] && source ~/.config/zsh/secrets.zsh

# zsh has no BASH_ENV, so agent shells point here instead.
[[ -r "$CONDUCTOR_ENV_FILE" ]] && source "$CONDUCTOR_ENV_FILE"
