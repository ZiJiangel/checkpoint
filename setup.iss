; Checkpoint 安装脚本
#define MyAppName "Checkpoint"
#define MyAppVersion "0.9.3"
#define MyAppExeName "Checkpoint.exe"

[Setup]
AppId={{8F3A2B1C-4D5E-6F70-8A9B-C1D2E3F40510}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=ZiJiangel
SetupIconFile=D:\03_学习\集群环境\集群快照管理器-pywebview\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=D:\03_学习\集群环境\集群快照管理器-发布\installer
OutputBaseFilename=Checkpoint-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
DisableProgramGroupPage=yes
DisableDirPage=no
DisableWelcomePage=no
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog

[Languages]
Name: "chinese"; MessagesFile: "compiler:Languages\ChineseSimplified.isl"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"

[Files]
Source: "D:\03_学习\集群环境\集群快照管理器-发布\Checkpoint.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "立即运行 {#MyAppName}"; Flags: nowait postinstall skipifsilent
