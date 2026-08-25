; Atria Print Agent — Inno Setup 6
; Compilar en Windows (tras npm run pack:win):
;   iscc packaging\out\AtriaPrintAgent.iss
;
; Espera en packaging/out/:
;   win-payload\atria-print-agent.cmd
;   win-payload\runtime\node.exe
;   win-payload\runtime\bundle.cjs
;   win-payload\runtime\node_modules\tray-hook\...
;   win-payload\runtime\node_modules\@phtdacosta\tray-hook-win32-x64\tray-hook.exe
;   win-payload\runtime\assets\tray-icon.png
;   atria-logo.png
;
; Sin tray-hook.exe el HTTP en :9876 sigue, pero no hay ícono en la bandeja.

#define MyAppName "Atria Print Agent"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Atria Solutions SpA"
#define MyAppURL "https://atriasolutions.cl"
#define MyAppExeName "atria-print-agent.cmd"

[Setup]
AppId={{E6B2C1A0-4F3D-4A91-9C2E-ATRIA-PRINT-01}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\Atria\PrintAgent
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=.
OutputBaseFilename=AtriaPrintAgent-Setup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#MyAppName}
WizardStyle=modern

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "autostart"; Description: "Iniciar Atria Print Agent al iniciar sesión"; Flags: checkedonce
Name: "desktopicon"; Description: "Crear icono en el escritorio"; Flags: unchecked

[Files]
Source: "win-payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "atria-logo.png"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/c ""{app}\{#MyAppExeName}"""; WorkingDir: "{app}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/c ""{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{cmd}"; Parameters: "/c ""{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Tasks: autostart

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "AtriaPrintAgent"; ValueData: """{cmd}"" /c """"{app}\{#MyAppExeName}"""""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{cmd}"; Parameters: "/c ""{app}\{#MyAppExeName}"""; WorkingDir: "{app}"; Description: "Iniciar Atria Print Agent ahora"; Flags: nowait postinstall skipifsilent

[Code]
function InitializeUninstall(): Boolean;
var
  ResultCode: Integer;
begin
  Exec('taskkill', '/IM node.exe /F', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := True;
end;
