$ErrorActionPreference = 'Stop'

subst X: C:\Users\user\TatzoApp\tatzo-new | Out-Null
Set-Location X:\

& 'C:\Users\user\TatzoApp\.codex-node\v20.19.4\node.exe' .\node_modules\eslint\bin\eslint.js src
& 'C:\Users\user\TatzoApp\.codex-node\v20.19.4\node.exe' .\node_modules\typescript\bin\tsc --noEmit
& 'C:\Users\user\TatzoApp\.codex-node\v20.19.4\node.exe' .\node_modules\expo\bin\cli doctor
