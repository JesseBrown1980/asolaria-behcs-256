param(
  [string]$RepoRoot = "C:\Users\acer\Asolaria"
)

$scriptPath = Join-Path $RepoRoot "tools\crypto\crypto-capsule.js"
node $scriptPath build
