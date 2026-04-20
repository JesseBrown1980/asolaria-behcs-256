# Item 162 · Acer startup folders + scheduled tasks inventory

## Scan method
- `shell:startup` folder: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`
- Task Scheduler: `schtasks /query /fo LIST /v | findstr /i asolaria`
- Services: `Get-Service -Name "*asolaria*"`

## Known Asolaria-named .cmd launchers at `C:/Users/acer/Asolaria/`
- `Gaia.cmd` · `Start-Gaia.cmd` · `Start-Asolaria.cmd` · `Start-Asolaria-Core.cmd` · `Start-Asolaria-Phone.cmd` · `Start-Asolaria-OneButton.cmd` · `Start-Asolaria-OneWindow.cmd` · `Start-Asolaria-ControlPlane.cmd` · `Start-Asolaria-ControlPlane-Sandbox.cmd` · `Stop-Asolaria-ControlPlane.cmd` · `Start-Omnispindle.cmd` · `Start-Dasein.cmd` · `Start-Helm-External.cmd` · `Start-Jesse-SuperAdminTerminal.cmd` · `Install-Jesse-SuperAdminTerminal.cmd`

## Policy
Startup/scheduled tasks that launch daemons are OPERATOR-local config. Their names are tracked here; binaries not published.
